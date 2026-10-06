/** Public schemas. Monetary amounts are validated safe integers in WorldService. */
export type ItemCategory =
  | "food"
  | "toy"
  | "clothing"
  | "furniture"
  | "trading_tool"
  | "collectible";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export interface Item {
  id: string;
  name: string;
  slug: string;
  category: ItemCategory;
  rarity: Rarity;
  description: string;
  baseValue: number;
  imageUrl?: string;
  icon: string;
  stackable: boolean;
  tradable: boolean;
  slot?: "hat" | "glasses" | "shirt" | "accessory";
  furnitureSlot?: "bed" | "plant" | "rug" | "computer" | "toy";
  features?: string[];
  effects?: { fullness?: number; happiness?: number; energy?: number };
}
export interface Shop {
  id: string;
  name: string;
  slug: string;
  category: ItemCategory;
  description: string;
  keeper: string;
  restockIntervalMinutes: number;
}
export interface ShopStock {
  shopId: string;
  itemId: string;
  quantity: number;
  price: number;
  stockedAt: Date;
}
export interface CollectionEntry {
  userId: string;
  itemId: string;
  discoveredAt: Date;
}
export interface CurrencyTransaction {
  id: string;
  userId: string;
  amount: number;
  type:
    | "shop_purchase"
    | "player_sale"
    | "daily_reward"
    | "arcade_reward"
    | "competition_reward"
    | "achievement_reward"
    | "gift"
    | "admin";
  relatedUserId?: string;
  relatedItemId?: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
}
export interface UserEvent {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  readAt?: Date;
}
export interface MochiRelationship {
  mochiAId: string;
  mochiBId: string;
  familiarity: number;
  affection: number;
  rivalry: number;
  trust: number;
  interactions: number;
  lastInteractionAt?: Date;
}
export interface CheckpointStorage {
  write(mochiId: string, version: number, bytes: Uint8Array): Promise<string>;
  read(key: string): Promise<Uint8Array>;
}
export interface BrainMetadata {
  mochiId: string;
  pack: string;
  checkpointKey: string;
  version: number;
  updatedAt: Date;
  leaseToken?: string;
  leaseUntil?: Date;
}
export interface TradingPostOffer {
  id: string;
  userId: string;
  items: { itemId: string; quantity: number }[];
  requested: { itemId: string; quantity: number }[];
  status: "draft" | "open" | "accepted" | "canceled";
}
export interface Auction {
  id: string;
  sellerId: string;
  itemId: string;
  quantity: number;
  minimumBid: number;
  endsAt: Date;
  status: "draft" | "open" | "closed" | "canceled";
}
