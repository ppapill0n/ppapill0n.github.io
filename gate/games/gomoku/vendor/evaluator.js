/*
Copyright (c) 2013 Yao Yujian

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
// Adapted from HTML5-Gomoku ai-worker.js, copyright (c) 2013 Yao Yujian (MIT).
// Pinned upstream a664ec1e7788c7cbdfbe223fb86f34162f9e006d. See LICENSE.txt.
// Only the incremental five-cell-window evaluator is retained. The upstream
// worker protocol, transposition cache and unbounded search are not used.
export function createEvaluator() {
function mapPoint(r,c){
    this.r=r;
    this.c=c;
    this.set=false;
    this.score=0;
    this.valid=false;
    this.info=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
}

const ai={};
ai.sum=0;
ai.setNum=0;
ai.scoreMap=[];
ai.scorequeue=[];
ai.map=[];
for (var i=0;i<15;i++){
    var tmp=[];
    for(var j=0;j<15;j++){
        var a=new mapPoint(i,j);
        tmp.push(a);
        ai.scorequeue.push(a);
    }
    ai.map.push(tmp);
}

const boardBuf = new ArrayBuffer(255);
const boardBufArr = new Uint8Array(boardBuf);
function bufToString(){
    return String.fromCharCode.apply(null, boardBufArr);
}

ai.color='black';
ai.otc='white';
ai.updateMap=function(r,c,color){
    var remove=false,num;
    if(color==this.color){
        num=1;
    }else if(color==this.otc){
        num=0;
    }else{
        remove=true;
        num=this.map[r][c].set-1;
    }
    return this._updateMap(r,c,num,remove);
};

ai.moves=[
        [-1,-1],
        [-1,0],
        [0,-1],
        [-1,1]
    ];
ai.coe=[-2,1];
ai.scores=[0,1,10,2000,4000,100000000000];

ai._updateMap=function(r,c,num,remove){
    var moves=this.moves,
        coe=this.coe,
        scores=this.scores,
        i=4,x,y,step,tmp,xx,yy,cur,changes=0,s,e;
    if(!remove){
        boardBufArr[r * 15 + c] = num + 2;
        this.map[r][c].set=num+1;
        while(i--){
            x=r;
            y=c;
            step=5;
            while( step-- && x>=0 && y>=0 && y<15 ){
                xx=x-moves[i][0]*4;
                yy=y-moves[i][1]*4;
                if(xx>=15 || yy<0 || yy>=15){
                    x+=moves[i][0];
                    y+=moves[i][1];
                    continue;
                }
                cur=this.map[x][y].info[i];
                if(cur[2]>0){
                    tmp=5;
                    xx=x;
                    yy=y;
                    s=scores[cur[2]];
                    changes-=s*cur[3];
                    while( tmp-- ){
                        this.map[xx][yy].score-=s;
                        xx-=moves[i][0];
                        yy-=moves[i][1];
                    }
                }
                cur[num]++;
                if(cur[1-num]>0){
                    cur[2]=0;
                }else{
                    cur[2]=cur[num];
                    e=coe[num];
                    cur[3]=e;
                    s=scores[cur[2]];
                    tmp=5;
                    xx=x;
                    yy=y;
                    changes+=s*cur[3];
                    while( tmp-- ){
                        this.map[xx][yy].score+=s;
                        xx-=moves[i][0];
                        yy-=moves[i][1];
                    }
                }
                x+=moves[i][0];
                y+=moves[i][1];
            }
        }
    }else{
        boardBufArr[r * 15 + c] = 0;
        this.map[r][c].set=false;
        while(i--){
            x=r;
            y=c;
            step=5;
            //others 0 i am 1-> sc=0
            //others 0 i am more than 1-> sc=1
            //i am >0 others >0 -> sc=-1
            while( step-- && x>=0 && y>=0 && y<15 ){
                xx=x-moves[i][0]*4;
                yy=y-moves[i][1]*4;
                if(xx>=15 || yy<0 || yy>=15){
                    x+=moves[i][0];
                    y+=moves[i][1];
                    continue;
                }
                cur=this.map[x][y].info[i];
                var sc=0;
                cur[num]--;
                if(cur[2]>0){
                    tmp=5;
                    xx=x;
                    yy=y;
                    s=scores[cur[2]];
                    changes-=s*cur[3];
                    while( tmp-- ){
                        this.map[xx][yy].score-=s;
                        xx-=moves[i][0];
                        yy-=moves[i][1];
                    }
                    cur[2]--;
                    if(cur[num]>0)sc=1;
                }else if(cur[1-num]>0 && !cur[num]){
                    sc=-1;
                }
                if(sc===1){
                    tmp=5;
                    s=scores[cur[2]];
                    xx=x;
                    yy=y;
                    changes+=s*cur[3];
                    while( tmp-- ){
                        this.map[xx][yy].score+=s;
                        //if(!this.map[xx][yy].set)changes+=s*cur[3];
                        xx-=moves[i][0];
                        yy-=moves[i][1];
                    }
                }else if(sc===-1){
                    cur[2]=cur[1-num];
                    tmp=5;
                    s=scores[cur[2]];
                    cur[3]=coe[1-num];
                    xx=x;
                    yy=y;
                    changes+=s*cur[3];
                    while( tmp-- ){
                        this.map[xx][yy].score+=s;
                        //if(!this.map[xx][yy].set)changes+=s*cur[3];
                        xx-=moves[i][0];
                        yy-=moves[i][1];
                    }
                }
                x+=moves[i][0];
                y+=moves[i][1];
            }
        }
    }
    this.sum+=changes;
};

ai.simulate=function(x,y,num){
    this.setNum++;
    this._updateMap(x,y,num,false);
};

ai.desimulate=function(x,y,num){
    this._updateMap(x,y,num,true);
    this.setNum--;
};


return ai;
}
