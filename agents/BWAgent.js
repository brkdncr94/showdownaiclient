/**
 * Created by brkdn on 01/05/2017.
 */

/**********************************************************************
 Making the assumption for all pokemon instead of just the one in front of us
 Retrieving opponent's options for planning (requires perfect knowledge)

 Otherwise planning with the assumption that opponent will not switch(?)
***********************************************************************/

'use strict';

var Pokemon = require('../zarel/battle-engine').BattlePokemon;
var clone = require('../clone')
var BattleSide = require('../zarel/battle-engine').BattleSide;
var MCTreeNode = require('./MCTree').MCTreeNode;
var PriorityQueue = require('priorityqueuejs');
var Tools = require('../zarel/tools');

// All Showdown AI Agents need 4 methods.

// decide takes in an approximation of the current gamestate, an associative array keyed by choices with choice details as value, and a string to remind you what side you are
// decide should return one of the keys in the array of choices.

// assumepokemon takes a name, level, gender, and the side of the pokemon in order to generate a best-guess estimate of the opponent's stats (which is hidden information)

// digest(line) is a way for you to customize how your agent deals with incoming information.  It doesn't have to do anything, but it can

// getTeam(format) should return the team that the agent plans on using.  This is only relevant if playing in a non-random format.

// All agents should also come with an assumptions object, which will guide how the InterfaceLayer deals with various aspects of hidden information.

class BWAgent {
    constructor() { }

    fetch_random_key(obj) {
        var temp_key, keys = [];
        for (temp_key in obj) {
            if (obj.hasOwnProperty(temp_key)) {
                keys.push(temp_key);
            }
        }
        return keys[Math.floor(Math.random() * keys.length)];
    }

    cloneBattle(state) {
        var nBattle = clone(state);
        nBattle.p1.getChoice = BattleSide.getChoice.bind(nBattle.p1);
        nBattle.p2.getChoice = BattleSide.getChoice.bind(nBattle.p2);
        nBattle.p1.clearChoice();
        nBattle.p2.clearChoice();
        return nBattle;
    }

    parseRequestData(requestData) {
        if (typeof (requestData) == 'string') { requestData = JSON.parse(request); }
        var cTurnOptions = {};
        if (requestData['active']) {
            for (var i = 0; i < requestData['active'][0]['moves'].length; i++) {
                if (requestData['active'][0]['moves'][i]['disabled'] == false && requestData['active'][0]['moves'][i].pp > 0) {
                    cTurnOptions['move ' + requestData['active'][0]['moves'][i].id] = requestData['active'][0]['moves'][i];
                }
            }
        }
        if (requestData['side'] && !(requestData['active'] && requestData['active'][0]['trapped'])) {
            // Basically, if we switch to zoroark, the request data will reflect it, but the switch event data will not.
            // Therefore, if a switch event happens on this turn, we override the swapped pokemon with zoroark
            for (var i = 1; i < requestData['side']['pokemon'].length; i++) {
                if (requestData['side']['pokemon'][i].condition.indexOf('fnt') == -1) {
                    cTurnOptions['switch ' + (i + 1)] = requestData['side']['pokemon'][i];
                }
            }
        }
        for (var option in cTurnOptions) {
            cTurnOptions[option].choice = option;
        }
        return cTurnOptions;
    }

    getOptions(state, player) {
        if (typeof (player) == 'string' && player.startsWith('p')) {
            player = parseInt(player.substring(1)) - 1;
        }
        let activeData = state.sides[player].active.map(pokemon => pokemon && pokemon.getRequestData());
        if (!state.sides[player].currentRequest) {
            return {
                forceskip: 'skip'
            };
        }
        if (state.sides[player].currentRequest == 'switch') {
            return this.parseRequestData({ side: state.sides[player].getData() });
        }
        return this.parseRequestData({ active: activeData, side: state.sides[player].getData(), rqid: state.rqid });
    }

    /*evaluateState(state, player) {
        var myp = state.sides[player].active[0].hp / state.sides[player].active[0].maxhp;
        var thp = state.sides[1 - player].active[0].hp / state.sides[1 - player].active[0].maxhp;
        return myp - 3 * thp - 0.3 * state.turn;
    }*/

    evaluateState(state, player) {
        var myp = state.sides[player].active[0].hp / state.sides[player].active[0].maxhp;
        var mstat = state.sides[player].active[0].status;
        if(mstat != '')
            myp = myp * 2 / 3;
        var boostLevel = state.sides[player].active[0].boosts.atk +
            state.sides[player].active[0].boosts.def +
            state.sides[player].active[0].boosts.spa +
            state.sides[player].active[0].boosts.spd +
            state.sides[player].active[0].boosts.spe +
            state.sides[player].active[0].boosts.accuracy +
            state.sides[player].active[0].boosts.evasion;
        myp = myp * (1 + boostLevel/(2*5));


        var thp = state.sides[1 - player].active[0].hp / state.sides[1 - player].active[0].maxhp;
        var thstat = state.sides[1 - player].active[0].status;
        if(thstat != '')
            thp = thp * 2 / 3;
        var boostLevel2 = state.sides[1-player].active[0].boosts.atk +
            state.sides[1-player].active[0].boosts.def +
            state.sides[1-player].active[0].boosts.spa +
            state.sides[1-player].active[0].boosts.spd +
            state.sides[1-player].active[0].boosts.spe +
            state.sides[1-player].active[0].boosts.accuracy +
            state.sides[1-player].active[0].boosts.evasion;
        thp = thp * (1 + boostLevel2/(2*5));
        //return myp - thp - 0.3 * state.turn
        return myp - thp;
    }

    getWorstOutcome(state, playerChoice, player) {
        //console.log("Inside getWorstOutcome");


        var nstate = this.cloneBattle(state);
        var oppChoices = this.getOptions(nstate, 1 - player);
        var worststate = null;
        for (var choice in oppChoices) {
            var cstate = this.cloneBattle(nstate);
            //console.log("Inside getWorstOutcome");
            cstate.choose('p' + (player + 1), playerChoice);
            //console.log("Inside getWorstOutcome");
            cstate.choose('p' + (1 - player + 1), choice);
            if (worststate == null || this.evaluateState(cstate, player) < this.evaluateState(worststate, player)) {
                worststate = cstate;
            }
        }
        //console.log("Returning getWorstOutcome");
        return worststate;
    }


    // FOR MONTE CARLO TREE SEARCH
    getQueue(treeNode){

        //console.log("GetQueue was called.");

        var pQueue = new PriorityQueue(function (a, b) {
                var aWin = a.winCount;
                var aPlay = a.playCount;
                var bWin = b.winCount;
                var bPlay = b.playCount;

                return ((aWin/aPlay)-(bWin/bPlay));

                //return ( a.getUCB1() - b.getUCB1())
            }
        );

        pQueue.enq(treeNode);
        for(var i=0; i<treeNode.children.length; i++){
            pQueue.enq(treeNode.children[i]);
        }

        return pQueue;
    }

    getArray(treeNode){

        var nodes = [];
        nodes.push(treeNode);
        // breadth first traversal of tree to put every node in an array
        for(var i=0; i<nodes.length; i++){
            // for every node already in the array, push its children into the array
            for(var j=0; j<nodes[i].children.length; j++){
                nodes.push(nodes[i].children[j]);
            }
        }
        return nodes;
    }

    selection(treeRoot, mySide){
        // Find a node with unexpanded children
        //console.log("Selection was called");

        //console.log("Calling GetQueue from Selection");
        var pQueue = this.getArray(treeRoot);

        //***************************************************
        var nodeIndex = Math.floor(Math.random() * pQueue.length);

        var tempNode = pQueue[nodeIndex];
        var myTurnOptions = this.getOptions(tempNode.gameState, mySide.id);

        var numOptions = 0;
        for(var opt in myTurnOptions){
            numOptions++;
        }

        while(tempNode === null || (tempNode.children.length >= numOptions) || (tempNode.parent === null)){
            nodeIndex = Math.floor(Math.random() * pQueue.length);
            tempNode = pQueue[nodeIndex];
            myTurnOptions = this.getOptions(tempNode.gameState, mySide.id);

            numOptions = 0;
            for(var opt in myTurnOptions){
                numOptions++;
            }

        }

        return tempNode;
        //***************************************************


        /*var size = pQueue.size();
        for(var i=0; i<size; i++ ){
            var tempNode = pQueue.deq();
            // get options for the game state at that node
            var myTurnOptions = this.getOptions(tempNode.gameState, mySide.id);

            var numOptions = 0;
            for(var opt in myTurnOptions){
                numOptions++;
            }

            //console.log("Number of tempNode's Children: " + tempNode.children.length);
            //console.log("Number of our options: " + numOptions);

            if(tempNode.children.length < numOptions){
                //console.log("Selected a node with unexpanded children");
                return tempNode;
            }
        }*/

        //console.log("Selected the root node with unexpanded children (THIS IS BS)");
        //return treeRoot;
    }

    expansion(treeNode, mySide){
        // identify an action not considered yet
        // if an action is considered, there is a child node containing that choice
        //console.log("Expansion was called");

        //console.log("Calling GetOptions from Expansion");
        /*if(treeNode.gameState.parent == null){
            console.log("Expanding from Root (current game state)");
        }*/

        var myTurnOptions = this.getOptions(treeNode.gameState, mySide.id);
        var toConsider = true;
        var choice;
        do{
            toConsider = false;
            // choose a random option
            choice = this.fetch_random_key(myTurnOptions);

            for(var i=0; i<treeNode.children.length; i++){
                // loop will go through all the children and see if the option was considered before
                if(treeNode.children[i].choice == choice){
                    toConsider = true;
                }
            }
        }while(toConsider == true)

        var cstate = this.cloneBattle(treeNode.gameState);

        //console.log("Calling GetWorstOutcome from Expansion");

        var newState= this.getWorstOutcome(cstate, choice, mySide.n);

        var newNode = new MCTreeNode(newState, treeNode, choice);
        treeNode.children.push(newNode);
        //console.log("Num of TreeNode's children: " + treeNode.children.length);

        return newNode;
    }

    simulation(treeNode, mySide){
        // we will perform random roll-outs while assuming the opponent deals the most damage possible
        // stop when one of the pokemon on the ground faint

        //console.log("Simulation was called");

        //tempNode = treeNode.deepCopy();
        var terminalState = false;

        /*while(terminalState == false){
            var cstate = this.cloneBattle(treeNode.gameState);

            var myTurnOptions = this.getOptions(cstate, mySide.id);
            var myRandomChoice = this.fetch_random_key(myTurnOptions);

            var newState= this.getWorstOutcome(cstate, myRandomChoice, mySide.n);

            var newNode = new MCTreeNode(newState, treeNode, myRandomChoice);
            treeNode.children.push(newNode);

            treeNode = newNode;
            terminalState = this.isTerminal(newState, mySide.n);
        }*/

        for(var i=0; i<10; i++){
            if(!this.isTerminal(treeNode.gameState, mySide.n)){
                var cstate = this.cloneBattle(treeNode.gameState);

                var myTurnOptions = this.getOptions(cstate, mySide.id);
                var myRandomChoice = this.fetch_random_key(myTurnOptions);

                var newState= this.getWorstOutcome(cstate, myRandomChoice, mySide.n);

                var newNode = new MCTreeNode(newState, treeNode, myRandomChoice);
                treeNode.children.push(newNode);
                treeNode = newNode;
            }
        }

        return treeNode;
    }

    backPropagation(terminalNode, mySide){

        while(terminalNode != null){
            terminalNode.playCount = terminalNode.playCount + 1;

            if(this.goodTerminal(terminalNode.gameState, mySide.n)){
                terminalNode.winCount = terminalNode.winCount + 1;
            }

            terminalNode = terminalNode.parent;
        }
    }

    isTerminal(gameState, player){
        if ((gameState.sides[1 - player].active[0].hp == 0) || (gameState.sides[player].active[0].hp == 0)) {
            return true;
        }
        return false;
    }

    goodTerminal(gameState, player){
        /*if (gameState.sides[1 - player].active[0].hp == 0) {
            return true;
        }*/
        if (gameState.sides[1 - player].active[0].hp < gameState.sides[player].active[0].hp) {
            return true;
        }
        return false;
    }


    greedyDecide(gameState, options, mySide) {
        var maxDamage = 0;
        var bOption = '';
        var oppactive = gameState.sides[1 - mySide.n].active;
        for (var option in options) {
            var nstate = this.cloneBattle(gameState);
            if (option.startsWith('move')) {
                var cDamage = nstate.getDamage(mySide.active[0], oppactive[0], options[option].id, false);

                if (cDamage && cDamage > maxDamage) {
                    // console.log(mySide.active[0].name + "'s " + options[option].move + " is expected to deal " + cDamage + " damage to " + oppactive[0].name);
                    maxDamage = cDamage;
                    bOption = option;
                }
            }
            else if (option.startsWith('switch')) {
                var pIndex = parseInt(option.split(" ")[1]) - 1;
                for (var move in nstate.sides[mySide.n].pokemon[pIndex].getMoves(null, false)) {
                    var mID = (nstate.sides[mySide.n].pokemon[pIndex].moves[move]);
                    var cDamage = nstate.getDamage(mySide.pokemon[pIndex], oppactive[0], mID, false);

                    if (cDamage && cDamage > maxDamage) {
                        // console.log(mySide.pokemon[pIndex].name + "'s " + mID + " is expected to deal " + cDamage + " damage to " + oppactive[0].name);
                        maxDamage = cDamage;
                        bOption = option;
                    }
                }

            }
            if (maxDamage == 0) {
                bOption = option;
                maxDamage = 1;
            }
        }
        // console.log(bOption);
        return bOption;
    }



    decide(gameState, options, mySide) {

        //var foe = mySide.foe.n;
        var choice;
        var nstate = this.cloneBattle(gameState);
        nstate.p1.currentRequest = 'move';
        nstate.p2.currentRequest = 'move';
            this.mySide = mySide.n;
            this.mySID = mySide.id;
            nstate.me = mySide.me;


        //var myTurnOptions = this.getOptions(nstate, mySide.id);
        var foeOptions = this.getOptions(nstate, mySide.foe.id);

        var oppactive = gameState.sides[1 - mySide.n].active;

        /*function battleSend(type, data) {
            if (this.sides[1 - this.me].active[0].hp == 0 || this.sides[1 - this.me].currentRequest == 'switch') {
                this.isTerminal = true;
            }
            if (this.sides[this.me].currentRequest != 'move') {
                this.badTerminal = true;
            }
        }*/

        /*function battleSend(type, data) {
            if (this.sides[1 - this.me].active[0].hp == 0) {
                this.isTerminal = true;
            }
            else if (this.sides[1 - this.me].currentRequest == 'switch' || this.sides[this.me].active[0].hp == 0) {
                this.badTerminal = true;
            }
        }*/

        //nstate.send = battleSend;

        var effectiveness = Tools.getEffectiveness(oppactive[0].types, mySide.active[0]);
        //console.log("Opponent's: " + oppactive[0] +  "  Mine: " + mySide.active[0].name);
        console.log("Opponent's effectiveness: " + effectiveness);

        //var effectiveness = 1;

        if(effectiveness > 0) {
            // Opponent is super effective, we should simply switch
            // Switch to the pokemon with greatest health or most effective?
            var bestSwitchChoice;
            var maxSwitchHP = 0;
            for(var option in options){
                if (option.startsWith('switch')){
                    var pIndex = parseInt(option.split(" ")[1]) - 1;
                    var pokemon = nstate.sides[mySide.n].pokemon[pIndex];
                    var switchEffectiveness = Tools.getEffectiveness(oppactive[0].types, pokemon);

                    //var switchEffectiveness = -1;
                    if((pokemon != null) && (switchEffectiveness < 0) && (pokemon.hp > maxSwitchHP)){
                        bestSwitchChoice = option;
                    }
                }
            }

            //var pIndex = parseInt(bestSwitchChoice.split(" ")[1]) - 1;
            var pokemon = nstate.sides[mySide.n].pokemon[pIndex];

            console.log("Opponent's pokemon is super-effective.");
            console.log("I am switching to: " + pokemon.name);


            if(bestSwitchChoice != null){
                choice = bestSwitchChoice;
            }
            else{
                console.log("Switching returned a NULL choice. WTF DUDE? - 1/n");
                choice = this.fetch_random_key(options);
            }

        }
        else {
            console.log("I SHALL MAKE AN AWESOME RANDOM PLAN!");
            // We should plan an attack
            // We are assuming the opponent will not switch
            //console.log("Creating Root Node");

            // This loop is occupying the first level of the tree
            var rootNode = new MCTreeNode(nstate, null, "");
            for(var opt in options){
                //if(opt.startsWith('move')){
                    var newState= this.getWorstOutcome(nstate, opt, mySide.n);
                    var newNode = new MCTreeNode(newState, rootNode, opt);
                    rootNode.children.push(newNode);
                //}

            }

            // build the Monte Carlo Tree
            for(var i=0; i<40; i++){

                //console.log("Calling Selection from Decide");
                var selectedNode = this.selection(rootNode, mySide);

                //console.log("Calling Expansion from Decide");
                var newNode = this.expansion(selectedNode, mySide);
                //console.log("Num of TreeNode's children: " + newNode.parent.children.length);

                //console.log("Calling Simulation from Decide");
                var terminalNode = this.simulation(newNode, mySide);

                //console.log("Calling BackPropagation from Decide");
                this.backPropagation(terminalNode, mySide);

            }

            var pQueue = this.getQueue(rootNode);
            var tempNode = pQueue.deq();
            if(tempNode.parent === null){
                tempNode = pQueue.deq();
            }

            choice = tempNode.choice;
            if(choice === null){
                console.log("MCTS returned a NULL choice. WTF DUDE? - 2/n");
                //choice = this.fetch_random_key(options);
                choice = this.greedyDecide(gameState, options, mySide);
            }

            console.log("MY AWESOME CHOICE IS: " + choice);
            //console.log("ITS UCB1 VALUE IS: " + tempNode.getUCB1());
            console.log("ITS Win/Play RATIO IS: " + (tempNode.winCount) + "/" + (tempNode.playCount));


            /*console.log("ROOT'S CHILDREN's PLAYCOUNTS : ");
            for(var i=0; i<rootNode.children.length;i++){
                console.log("CHILD " + rootNode.children[i].choice + " Win/Play RATIO IS: " + (rootNode.children[i].winCount) + "/" + (rootNode.children[i].playCount));
            }*/

            if((tempNode.winCount / tempNode.playCount) === 0){
                console.log("Everyting seems equally bad. Making the greedy choice.");
                choice = this.greedyDecide(gameState, options, mySide);
            }

        }

        return choice;
    }


    isInMyTeam(pname, mySide){
        var index = -1;
        for(var i = 0; i < mySide.pokemon.length; i++) {
            if (pname === mySide.pokemon[i].name) {
                index = i;
            }
        }

        return index;
    }

    // A function that takes in a pokemon's name as string and level as integer, and returns a BattlePokemon object.
    // Assumption Engine is designed to fill in the blanks associated with partial observability.
    // This engine in particular assumes perfect IVs and 100 EVs across the board except for speed, with 0 moves.
    // Other assumption systems can be used as long as they implement assume(pokemon, level)
    assumePokemon(pname, plevel, pgender, side) {

        var mySide = side.foe;
        /*var oppPokemon = []

        for(var i = 0; i < mySide.pokemon.length; i++) {

            var nSet = {
                species: Tools.getSpecies(mySide.pokemon[i].species),
                name: mySide.pokemon[i].name,
                level: mySide.pokemon[i].level,
                gender: mySide.pokemon[i].gender,
                evs: mySide.pokemon[i].evs,
                ivs: mySide.pokemon[i].ivs,
                nature: "Hardy",
                moves: mySide.pokemon[i].moves,
                ability: mySide.pokemon[i].ability
            };

            var basePokemon = new Pokemon(nSet, side);

            oppPokemon.push(basePokemon)

            //mySide.foe.pokemon[i] = basePokemon;
            console.log('Assume set ' + i + 'th Pokemon: ' +  mySide.pokemon[i].name);

        }
        return oppPokemon;*/

        /*var index = 0;
        for(var i = 0; i < mySide.pokemon.length; i++) {
            if (mySide.pokemon[i].name == pname){
                index = i;
            }
        }*/
        var index = this.isInMyTeam(pname,mySide);

        if(index >= 0){

            var nSet = {
                species: pname,
                name: pname,
                level: plevel,
                gender: pgender,
                evs: mySide.pokemon[index].evs,
                ivs: mySide.pokemon[index].ivs,
                nature: "Hardy",
                moves: mySide.pokemon[index].moves,
                ability: mySide.pokemon[index].ability
            };
            var basePokemon = new Pokemon(nSet, side);
            basePokemon.abilityData = { id: basePokemon.ability };
            // If the species only has one ability, then the pokemon's ability can only have the one ability.
            // Barring zoroark, skill swap, and role play nonsense.
            // This will be pretty much how we digest abilities as well
            /*if (Object.keys(basePokemon.template.abilities).length == 1) {
             basePokemon.baseAbility = toId(basePokemon.template.abilities['0']);
             basePokemon.ability = basePokemon.baseAbility;
             basePokemon.abilityData = { id: basePokemon.ability };
             }*/
            console.log("Assume set opponent's Pokemon: " + basePokemon.name + " as " +  mySide.pokemon[index].name);
            return basePokemon;

        }
        else{
            var template = Tools.getTemplate(pname);
            var nSet = {
                species: pname,
                name: pname,
                level: plevel,
                gender: pgender,
                evs: {
                    hp: 85,
                    atk: 85,
                    def: 85,
                    spa: 85,
                    spd: 85,
                    spe: 85
                },
                ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
                nature: "Hardy",
                moves: [],
            };
            for (var moveid in template.randomBattleMoves) {
                nSet.moves.push(toId(template.randomBattleMoves[moveid]));
            }
            var basePokemon = new Pokemon(nSet, side);
            // If the species only has one ability, then the pokemon's ability can only have the one ability.
            // Barring zoroark, skill swap, and role play nonsense.
            // This will be pretty much how we digest abilities as well
            if (Object.keys(basePokemon.template.abilities).length == 1) {
                basePokemon.baseAbility = toId(basePokemon.template.abilities['0']);
                basePokemon.ability = basePokemon.baseAbility;
                basePokemon.abilityData = { id: basePokemon.ability };
            }
            return basePokemon;
        }
    }

    digest(line) {
    }

    getTeam(format) {
    }
}

exports.Agent = BWAgent;
