export const ITEMS=[
 ['plain','Plain Mochi','Food',10,'🍡'],['strawberry','Strawberry Mochi','Food',15,'🍓'],['sushi','Sushi','Food',20,'🍣'],['ramen','Ramen','Food',20,'🍜'],
 ['ball','Ball','Toys',50,'🎾'],['plushie','Plushie','Toys',75,'🧸'],['puzzle','Puzzle Cube','Toys',100,'🧩'],
 ['cap','Red Cap','Hats',100,'🧢','hat'],['glasses','Trader Glasses','Glasses',150,'👓','glasses'],['hoodie','Blue Hoodie','Shirts',200,'👕','shirt'],
 ['plant','Happy Plant','Furniture',80,'🪴'],['terminal','Basic Terminal','Trading Tools',0,'💻'],['scanner','Volume Scanner','Trading Tools',300,'📡'],['quant','Quant Glasses','Trading Tools',500,'🔬']
].map(([id,name,category,price,icon,slot])=>({id,name,category,price,icon,slot}));
export const newEconomy=()=>({coins:500,inventory:{plain:3,ball:1,terminal:1},equipped:{},dailyClaim:null,achievements:[]});
export function purchase(e,id){const item=ITEMS.find(x=>x.id===id);if(!item)throw new Error('Unknown item');if(item.category!=='Food'&&e.inventory[id])throw new Error('Already owned');if(e.coins<item.price)throw new Error('Not enough Mochi Coins');e.coins-=item.price;e.inventory[id]=(e.inventory[id]??0)+1;return item;}
export function dailyReward(e,now=Date.now()){const day=new Date(now).toISOString().slice(0,10);if(e.dailyClaim===day)return 0;e.dailyClaim=day;e.coins+=25;return 25;}
export function getUnlockedTradingFeatures(e){const f=new Set();if(e.inventory.terminal)f.add('basic');if(e.inventory.scanner)f.add('volume');if(e.inventory.quant)f.add('quant');return f;}
export function achievement(e,id,coins){if(e.achievements.includes(id))return 0;e.achievements.push(id);e.coins+=coins;return coins;}
