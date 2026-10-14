import {COMBAT_VENDORS, VENDORS} from './adventure.js';

// Ordinary gameplay Coins. These prices never quote or convert SPL token units.
const shop = (id, items) => Object.freeze({...COMBAT_VENDORS.find(v=>v.id===id), items:Object.freeze(items)});
export const COIN_SHOPS = Object.freeze({
  blacksmith: shop('blacksmith', {
    'basic-sword':80, 'reed-staff':140, 'ash-bow':220, 'thorn-dagger':200,
    'travel-cap':80, 'padded-coat':160, 'fishing-rod':60, 'basic-axe':50,
  }),
  mage: shop('mage', {'ice-shard':180, shield:220, lightning:360}),
  apothecary: shop('apothecary', {
    'small-potion':20, 'large-potion':40, 'mana-potion':24, antidote:16, 'combat-food':18,
  }),
  charms: shop('charms', {'iron-ring':160, 'ember-charm':180, 'bond-necklace':200, 'healer-pendant':180}),
});
export const COIN_BUYERS = Object.freeze({
  fish: {...VENDORS.fish, prices:{'common-minnow':10, 'silver-carp':25, moonfish:45, 'golden-koi':70}},
  wood: {...VENDORS.wood, prices:{softwood:10, hardwood:22, 'ancient-bark':40}},
  blacksmith: {...COMBAT_VENDORS.find(v=>v.id==='blacksmith'), name:'Bram · Material Buyer',
    prices:{'slime-resin':8, 'boar-hide':15, 'thorn-fiber':12, 'river-pearl':45, 'guardian-stone':80}},
});
