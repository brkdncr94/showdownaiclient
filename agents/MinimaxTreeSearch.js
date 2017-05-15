'use strict';

var Pokemon = require('../zarel/battle-engine').BattlePokemon;
var clone = require('../clone')
var BattleSide = require('../zarel/battle-engine').BattleSide;
var PriorityQueue = require('priorityqueuejs');

// Sometimes you want to simulate things in the game that are more complicated than just damage.  For these things, we can advance our fun little forward model.
// This agent shows a way to advance the forward model.
class VGreedyAgent {
    constructor() { }

    cloneBattle(state) {
        var nBattle = clone(state);
        nBattle.p1.getChoice = BattleSide.getChoice.bind(nBattle.p1);
        nBattle.p2.getChoice = BattleSide.getChoice.bind(nBattle.p2);
        nBattle.p1.clearChoice();
        nBattle.p2.clearChoice();
        return nBattle;
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

    fetch_random_key(obj) {
        var temp_key, keys = [];
        for (temp_key in obj) {
            if (obj.hasOwnProperty(temp_key)) {
                keys.push(temp_key);
            }
        }
        return keys[Math.floor(Math.random() * keys.length)];
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
                    //cTurnOptions['switch ' + (i + 1)] = requestData['side']['pokemon'][i];
                }
            }
        }
        for (var option in cTurnOptions) {
            cTurnOptions[option].choice = option;
        }
        return cTurnOptions;
    }

    evaluateState(state) {
        if(state==null){
            //console.log(state);
            return null;
        }
        var myp = state.sides[state.me].active[0].hp / state.sides[state.me].active[0].maxhp;
        var mstat = state.sides[state.me].active[0].status;
        if(mstat != '')
            myp = myp * 2 / 3;

        var boostLevel = state.sides[state.me].active[0].boosts.atk +
            state.sides[state.me].active[0].boosts.def +
            state.sides[state.me].active[0].boosts.spa +
            state.sides[state.me].active[0].boosts.spd +
            state.sides[state.me].active[0].boosts.spe +
            state.sides[state.me].active[0].boosts.accuracy +
            state.sides[state.me].active[0].boosts.evasion;

        myp = myp * (1 + boostLevel/(2*5));

        //console.log('mhp '+ myp);


        var thp = state.sides[1 - state.me].active[0].hp / state.sides[1 - state.me].active[0].maxhp;
        var thstat = state.sides[1 - state.me].active[0].status;
        if(thstat != '')
            thp = thp * 2 / 3;
        var boostLevel2 = state.sides[1-state.me].active[0].boosts.atk +
            state.sides[1-state.me].active[0].boosts.def +
            state.sides[1-state.me].active[0].boosts.spa +
            state.sides[1-state.me].active[0].boosts.spd +
            state.sides[1-state.me].active[0].boosts.spe +
            state.sides[1-state.me].active[0].boosts.accuracy +
            state.sides[1-state.me].active[0].boosts.evasion;
        thp = thp * (1 + boostLevel2/(2*5));

        //console.log("thp "+thp); b
        //return myp - thp - 0.3 * state.turn
        return myp - thp;
    }


    getWorstOutcome2(state, playerChoice, player, turns) {
        //console.log("turns "+turns);
        //var nstate = this.cloneBattle(state);
        var oppChoices = this.getOptions(state, 1 - player);
        var returnState = null;
        for (var choice in oppChoices) {
            //console.log(cstate);
            var cstate = this.cloneBattle(state);
            //console.log("cturn "+ cstate.turn);
            //console.log('choices '+ choice);
            //console.log(cstate.sides[cstate.me].active[0].fullname+' '+cstate.sides[cstate.me].active[0].hp);
            //console.log(cstate.sides[1-cstate.me].active[0].fullname+' '+cstate.sides[1-cstate.me].active[0].hp);
            //console.log("eval before: "+ this.evaluateState(cstate));
            cstate.choose('p' + (player + 1), playerChoice);
            //console.log(" player use "+playerChoice);
            cstate.choose('p' + (1 - player + 1), choice);
            //console.log(" player op use "+ choice);

            //console.log("eval after: "+ this.evaluateState(cstate));

            //console.log("cturn "+cstate.turn);

            if(turns == 0){
                if(returnState == null||this.evaluateState(cstate,player)<this.evaluateState(returnState,player)) {
                    returnState = cstate;
                    // console.log("worseStat Find");
                }
            }
            else{
                // console.log("get here");
                var playerChoices = this.getOptions(cstate, player);
                var worstLeftturnState = null;
                var cstate2 = this.cloneBattle(cstate);
                for(var choice in playerChoices) {

                    //console.log("player Choose "+ choice +" as next choice");
                    var possibleLeftturnState = this.getWorstOutcome2(cstate2,choice,player,turns-1);
                    //console.log(this.evaluateState((possibleLeftturnState)));

                    if( worstLeftturnState == null||(turns-1 == 0 &&this.evaluateState(possibleLeftturnState,player)<this.evaluateState(worstLeftturnState,player))) {
                        worstLeftturnState = possibleLeftturnState;
                        //console.log(" worstState "+ this.evaluateState(worstLeftturnState,player));
                    }
                }
                returnState = worstLeftturnState;
            }

        }
        //console.log("return "+ this.evaluateState(returnState,player));
        return returnState;
    }

    getBestmove(state,player){
        var nstate = this.cloneBattle(state);
        var options = this.getOptions(nstate,player);
        var opOptions = this.getOptions(nstate,1-player);
        var bestEval = null;
        var bestMove = null;
        var bestOpMove = null;
        var bestOpEval = null;

        for(var choice in options) {

            for (var opOption in opOptions) {
                var cstate = this.cloneBattle(nstate);
                cstate.choose('p' + (player + 1), choice);
                cstate.choose('p' + (1 - player + 1), opOption);
                var evalState = this.evaluateState(cstate, 1 - player+1);
                console.log(evalState);
                if (bestOpEval == null || bestOpEval < evalState) {
                    bestOpEval = evalState;
                    bestOpMove = opOption
                }
            }

        }
        return bestMove;

    }


    decide(gameState, options, mySide, forceSwitch) {
        //console.log(gameState.sides[mySide.n].active[0].fullname+ ' '+ gameState.sides[mySide.n].active[0].moves);
        //console.log(gameState.sides[1-mySide.n].active[0].fullname+' '+gameState.sides[1-mySide.n].active[0].moves);

        for(var i=0; i<6; i++){
            console.log("OPPONENT'S POKEMON: " + gameState.sides[1 - mySide.n].pokemon[i])
            //console.log("OPPONENT'S POKEMON: " + foe.pokemon[i])
        }

        // It is important to start by making a deep copy of gameState.  We want to avoid accidentally modifying the gamestate.
        var nstate = this.cloneBattle(gameState);

        nstate.p1.currentRequest = 'move';
        nstate.p2.currentRequest = 'move';
        nstate.me = mySide.n;
        this.mySID = mySide.n;
        this.mySide = mySide.id;
        var toPrint = gameState.p1.pokemon;


        //this.getWorstOutcome2(nstate,'switch 2', nstate.me,0);
        //console.log("deep 2")
        //this.getWorstOutcome2(nstate,'switch 2', nstate.me,1);
       // console.log(killhrer)

/*
        var myTurnOptions = this.getOptions(nstate, mySide.id);
        var i = 1;
        console.log("myTurnOptions");
        for(var opt in myTurnOptions){
            console.log("Option " + i + ": " + opt);
            i++;
        }

        i = 1;
        console.log("Given Options");
        for(var opt in options){
            console.log("Option " + i + ": " + opt);
            i++;
        }
        console.log("Number of our options: " + options.length);
*/

        for (var testA in gameState.sides[mySide.n].active[0].moves){
        //    console.log(testA);
        }
        //console.log(mySide);
        //console.log(gameState.p1.active);
        //console.log(killhere);
        function battleSend(type, data) {
            if (this.sides[1 - this.me].active[0].hp == 0) {
                this.isTerminal = true;
            }
            else if (this.sides[1 - this.me].currentRequest == 'switch' || this.sides[this.me].active[0].hp == 0) {
                this.badTerminal = true;
            }
        }

        //nstate.send = battleSend;

//        console.log('best outcome '+ this.getBestOutcome(nstate,mySide.n));
        var forcedToSwitch = true;
        var moveToUse = null;
        var bestMoveCase = null;
        var bestSwitchCase = -2;
        var switchToUse = null;
        var expectedToSwitch = false;
        var badswitch = true;
        var possibleSwitches = [];
        var possibleMoves = [];
        var currentEval = this.evaluateState(nstate);
        //console.log('current '+ currentEval);
        //console.log(options);
        for(var choice in options){
        //    console.log(choice);
        }
        for (var choice in options) {
            if(choice.startsWith('move')) {
                //console.log(choice);
                forcedToSwitch = false;

                var badstateEval = 0;

                for(var i=0;i<8;i++)
                {
                    var cstate = this.cloneBattle(nstate);
                    for(var j=0;j<i;j++)
                    {
                        cstate.random();
                    }

                    var badstate = this.getWorstOutcome2(cstate, choice, cstate.me, 0);
                    badstateEval += this.evaluateState(badstate);
                    //console.log(this.evaluateState(badstate));
                }
                badstateEval /= 8;

                console.log(choice + ' ' + badstateEval);
                if (badstateEval >= 0) {
                    possibleMoves.push(choice);
                }

                if (bestMoveCase == null || bestMoveCase < badstateEval) {
                    bestMoveCase = badstateEval;
                    moveToUse = choice;
                }
                //console.log("worst case "+ worstCase);
                /*
                else{
                    var worstCase2 = null;
                    for(var choice in possibleMoves){

                        var cstate = this.cloneBattle(nstate);
                        var badstate = this.getWorstOutcome2(cstate, choice, cstate.me, 1);
                        var badstateEval = this.evaluateState(badstate);

                        if (worstCase2 == null || worstCase2 < badstateEval) {
                            worstCase2 = badstateEval;
                            moveToUse = choice;
                        }
                    }
                }*/
            }
            else{
                possibleSwitches.push(choice);
            }
        }


        var lossPercent = bestMoveCase - currentEval;
        //console.log('moveToUse '+ moveToUse+' bestCase'+bestMoveCase+' currentEval '+currentEval);
        if((lossPercent < 0 )){
          //  console.log('current ' + currentEval+' '+ bestMoveCase);
          //  console.log(gameState.sides[mySide.n].active[0].fullname+ ' '+ gameState.sides[mySide.n].active[0].moves);
            //console.log(mySide.active[0].fullname);
           // this.getOptions(nstate,nstate.me);
           // console.log(nstate.side[nstate.me]);
            //console.log(nstate.side[1-nstate.me]);
            expectedToSwitch = true;

        }

        var switchPercent = -2;

        if(expectedToSwitch == true||forcedToSwitch == true)
        {
            //console.log(possibleSwitches);
            for(var switchNum in possibleSwitches)
            {
                var switchChoice = possibleSwitches[switchNum];
                //console.log(switchChoice);

                var badstateEval = 0;
                var badstate = null;
                for(var i=0;i<1;i++)
                {
                    var cstate = this.cloneBattle(nstate);
                    for(var j=0;j<i;j++)
                    {
                        cstate.random();
                    }
                    badstate = this.getWorstOutcome2(cstate, switchChoice, cstate.me, 0);
                    badstateEval += this.evaluateState(badstate);
                    //console.log(this.evaluateState(badstate));
                }
                badstateEval /= 1;
                while(this.evaluateState(badstate)>badstateEval+0.1||this.evaluateState(badstate)<badstateEval-0.1)
                {
                    badstate = this.getWorstOutcome2(cstate, switchChoice, cstate.me, 0);
                }


                var badstate2 = null;
                for(var choice in this.getOptions(badstate, badstate.me) ){
                    var tstat = this.getWorstOutcome2(badstate,choice,badstate.me,0);
                    if(badstate2 == null||this.evaluateState(badstate2)<this.evaluateState(tstat))
                    {
                        badstate2 = tstat;
                    }

                }
                //var badstate2 = this.getWorstOutcome2(badstate, switchChoice, badstate.me, 0);
                //console.log(this.evaluateState(cstate));

                //console.log('after switch turn2 ' + this.evaluateState(badstate2));
                //console.log(this.evaluateState(badstate2));
                //console.log(killhere)

                var badstateEval = this.evaluateState(badstate2) - this.evaluateState(badstate);
                if(badstate2!=null)
                {
                    //console.log('badstat2 turn '+badstate2.turn);
                    //console.log(badstate2.sides[badstate2.me].active[0].fullname);
                    //console.log('badstat turn '+ badstate.turn);


                    //console.log(switchChoice + ' hpEval:' + (badstate.sides[badstate.me].active[0].hp) + ' ' + badstate2.sides[badstate2.me].active[0].hp + ' ' + badstate.sides[badstate.me].active[0].maxhp + ' Eval: ' + badstateEval + ' | ' + this.evaluateState(badstate2) + ' ' + this.evaluateState(badstate));
                    //console.log(badstate.sides[badstate.me].active[0].fullname +' '+badstate.sides[badstate.me].active[0].moves );
                    //console.log('best '+bestSwitchCase);
                   // var flagt = badstate.sides[badstate.me].active[0].hp != 0 && badstate2.sides[badstate2.me].active[0].hp!=0 && (badstate.sides[badstate.me].active[0].hp - badstate2.sides[badstate2.me].active[0].hp)/ badstate.sides[badstate.me].active[0].maxhp <0.33 &&(badstate.sides[badstate.me].active[0].hp - badstate2.sides[badstate2.me].active[0].hp )!=0;

                   // console.log(flagt);
                }
                if ((bestSwitchCase < badstateEval ||(switchToUse ==null))) {
                    if( badstate2 != null && (badstate.sides[badstate.me].active[0].hp != 0 &&badstate2.sides[badstate2.me].active[0].hp!=0 && (badstate.sides[badstate.me].active[0].hp - badstate2.sides[badstate2.me].active[0].hp)/ badstate.sides[badstate.me].active[0].maxhp <0.33)&&(badstate.sides[badstate.me].active[0].hp - badstate2.sides[badstate2.me].active[0].hp )!=0) {
                        badswitch = false;
                        bestSwitchCase = badstateEval;
                        switchToUse = switchChoice;
                        switchPercent = badstateEval;
                       // console.log("good switch" + switchChoice);
                    }
                    if(switchToUse == null){
                        badswitch == true;
                        bestSwitchCase = badstateEval;
                        switchToUse = switchChoice;
                        switchPercent = badstateEval;
                    }

                    if(badstate2 != null && badstate !=null) {
                     //   console.log(badstate2.sides[mySide.n].active[0].fullname + ' ' + badstate2.sides[mySide.n].active[0].moves);
                        //console.log(this.evaluateState(badstate));
                        //console.log(this.evaluateState(badstate2));
                    }
                    else{
                   //     console.log("null state");
                    }
                }

            }
            //console.log('bestswitchcase ' + bestSwitchCase);
        }

        if(moveToUse ==null)
        {
            console.log(switchToUse)
            return switchToUse;
        }

        if( (lossPercent + 0.15 > switchPercent || badswitch == true) && expectedToSwitch==true ){
           console.log("lossing");
           // console.log()
          // console.log(gameState.sides[mySide.n].active[0].fullname+ ' '+ gameState.sides[mySide.n].active[0].moves);
            return moveToUse;
        }

        if(expectedToSwitch == true&& switchToUse!= null&&badswitch==false)
        {
            console.log(switchToUse);
            return switchToUse;
        }


        console.log("choice to use |"+ moveToUse);
        return moveToUse;


    }

    assumePokemon(pname, plevel, pgender, side) {
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
        var moveLimit = 4;
        for (var moveid in template.randomBattleMoves) {
            if(moveLimit!=0) {
                nSet.moves.push(toId(template.randomBattleMoves[moveid]));
                moveLimit--;
            }
        }
        //nSet.moves.push(107);
        //console.log(nSet);
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

    digest(line) {
    }
}

exports.Agent = VGreedyAgent;
