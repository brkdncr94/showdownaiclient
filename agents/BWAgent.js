/**
 * Created by brkdn on 01/05/2017.
 */

'use strict';

var Pokemon = require('../zarel/battle-engine').BattlePokemon;
var clone = require('../clone')
var BattleSide = require('../zarel/battle-engine').BattleSide;
//var MCTreeNode = require('./MCTree').MCTreeNode;
var PriorityQueue = require('priorityqueuejs');
var Tools = require('../zarel/tools');

// All Showdown AI Agents need 4 methods.

// decide takes in an approximation of the current gamestate, an associative array keyed by choices with choice details as value, and a string to remind you what side you are
// decide should return one of the keys in the array of choices.

// assumepokemon takes a name, level, gender, and the side of the pokemon in order to generate a best-guess estimate of the opponent's stats (which is hidden information)

// digest(line) is a way for you to customize how your agent deals with incoming information.  It doesn't have to do anything, but it can

// getTeam(format) should return the team that the agent plans on using.  This is only relevant if playing in a non-random format.

// All agents should also come with an assumptions object, which will guide how the InterfaceLayer deals with various aspects of hidden information.
class MCTreeNode {

    constructor(gameState, parent, choice) {

        this.gameState = gameState; //clone(gameState);
        this.children = [];
        this.parent = parent;
        this.choice = choice;
        this.playCount = 1;
        this.winCount = 0;
    }

    getUCB1 () {
        // See https://en.wikipedia.org/wiki/Monte_Carlo_tree_search#Exploration_and_exploitation
        if(this.parent != null){
            return (this.winCount / this.playCount) + Math.sqrt(2 * Math.log(this.parent.playCount) / this.playCount);
        }
        else{
            return (-1);
        }
    }

}












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

    evaluateState(state, player) {
        var myp = state.sides[player].active[0].hp / state.sides[player].active[0].maxhp;
        var thp = state.sides[1 - player].active[0].hp / state.sides[1 - player].active[0].maxhp;
        return myp - 3 * thp - 0.3 * state.turn;
    }

    getWorstOutcome(state, playerChoice, player) {
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
        return worststate;
    }


    // FOR MONTE CARLO TREE SEARCH
    getQueue(treeNode){
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
        var pQueue = this.getArray(treeRoot);
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
    }

    expansion(treeNode, mySide){
        // identify an action not considered yet
        // if an action is considered, there is a child node containing that choice
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

        var newState= this.getWorstOutcome(cstate, choice, mySide.n);

        var newNode = new MCTreeNode(newState, treeNode, choice);
        treeNode.children.push(newNode);

        return newNode;
    }

    simulation(treeNode, mySide){
        // we will perform random roll-outs while assuming the opponent deals the most damage possible
        // stop when one of the pokemon on the ground faint
        var terminalState = false;

        for(var i=0; i<5; i++){
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
        return bOption;
    }



    decide(gameState, options, mySide) {
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

        var effectiveness = Tools.getEffectiveness(oppactive[0].types, mySide.active[0]);
        console.log("Opponent's effectiveness: " + effectiveness);

        if(effectiveness > 0) {
            // Opponent is super effective, we should simply switch
            // Switch to the pokemon with greatest health or most effective?
            var bestSwitchChoice;
            var maxSwitchHP = 0;
            var pIndex;
            for(var option in options){
                if (option.startsWith('switch')){
                    pIndex = parseInt(option.split(" ")[1]) - 1;
                    var pokemon = nstate.sides[mySide.n].pokemon[pIndex];
                    var switchEffectiveness = Tools.getEffectiveness(oppactive[0].types, pokemon);

                    if((pokemon != null) && (switchEffectiveness < 0) && (pokemon.hp > maxSwitchHP)){
                        bestSwitchChoice = option;
                    }
                }
            }

            var pokemon = nstate.sides[mySide.n].pokemon[pIndex];

            console.log("Opponent's pokemon is super-effective.");
            console.log("I am switching to: " + pokemon.name);


            if(bestSwitchChoice != null){
                choice = bestSwitchChoice;
            }
            else{
                console.log("Switching returned a NULL choice. THIS SHOULDN'T HAPPEN - 1/n");
                choice = this.fetch_random_key(options);
            }

        }
        else {
            console.log("I SHALL MAKE AN AWESOME RANDOM PLAN!");
            // We should plan an attack
            // We are assuming the opponent will not switch

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

                var selectedNode = this.selection(rootNode, mySide);
                var newNode = this.expansion(selectedNode, mySide);
                var terminalNode = this.simulation(newNode, mySide);
                this.backPropagation(terminalNode, mySide);
            }

            var pQueue = this.getQueue(rootNode);
            var tempNode = pQueue.deq();
            if(tempNode.parent === null){
                tempNode = pQueue.deq();
            }

            choice = tempNode.choice;
            if(choice === null){
                console.log("MCTS returned a NULL choice. THIS SHOULDN'T HAPPEN - 2/n");
                choice = this.greedyDecide(gameState, options, mySide);
            }

            console.log("MY AWESOME CHOICE IS: " + choice);
            console.log("ITS Win/Play RATIO IS: " + (tempNode.winCount) + "/" + (tempNode.playCount));

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

exports.MCTreeNode = MCTreeNode;
exports.Agent = BWAgent;
