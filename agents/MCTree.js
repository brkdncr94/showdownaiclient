/**
 * Created by brkdn on 06/05/2017.
 */

'use strict';

var clone = require('../clone')

class MCTreeNode {

    constructor(gameState, parent, choice) {

        this.gameState = gameState; //clone(gameState);
        this.children = [];
        this.parent = parent;
        this.fitness = 0;
        this.choice = choice;
        this.playCount = 1;
        this.winCount = 0;

    }

    calculateFitness(state){
        // calculate with the HP of current pokemon
        oppHP = state.sides[1 - state.me].active[0].hp;
        myHP = state.sides[state.me].active[0].hp;

        fit = myHP - oppHP

        return fit;
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

    deepCopy(){
        var newNode = new MCTreeNode(this.gameState,this.parent,this.choice);

        return newNode;
    }



}

exports.MCTreeNode = MCTreeNode;