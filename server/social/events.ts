export type CompanionState =
  | "IDLE"
  | "PLAYING"
  | "FOLLOWING"
  | "WANDERING"
  | "INTERACTING"
  | "RESTING"
  | "RETURNING";
export type SpeechVisibility = "owner_only" | "room";
export type ClientEvent =
  | { type: "joinRoom"; data: { roomId: string } }
  | { type: "leaveRoom"; data: Record<string, never> }
  | { type: "move"; data: { x: number; y: number } }
  | {
      type: "emote";
      data: {
        emote:
          | "wave"
          | "heart"
          | "laugh"
          | "surprised"
          | "dance"
          | "cheer"
          | "sad"
          | "sit";
      };
    }
  | {
      type: "phrase";
      data: {
        phrase: "Nice Mochi!" | "Want to play?" | "Hello!" | "Good game!";
      };
    }
  | { type: "interact"; data: { propId: string } }
  | {
      type: "talkToMochi";
      data: { mochiId: string; message: string; visibility: SpeechVisibility };
    }
  | { type: "presence"; data: { status: "online" | "away" } }
  | { type: "view"; data: { halfWidth: number; halfHeight: number } };
export interface PlayerAvatar {
  user_id: string;
  display_name: string;
  body_color: string;
  equipment: Partial<
    Record<
      "hat" | "face" | "top" | "accessory" | "back" | "hand" | "feet",
      string
    >
  >;
  current_room_id: string;
  last_x: number;
  last_y: number;
  updated_at: string;
}
export interface MochiOwnershipState {
  mochiId: string;
  userId: string;
  isActiveCompanion: boolean;
}
export interface Companion {
  id: string;
  name: string;
  x: number;
  y: number;
  state: CompanionState;
  profile: { variant?: string };
}
export interface PublicPlayer {
  userId: string;
  username: string;
  avatar: PlayerAvatar;
  x: number;
  y: number;
  moving: boolean;
  rotation: number;
  companion: Companion | null;
  presence: "online" | "away";
}
export type ServerEvent =
  | { type: "ready"; data: { userId: string } }
  | {
      type: "roomSnapshot";
      data: {
        roomId: string;
        instanceId: string;
        selfId: string;
        capacity: number;
        players: PublicPlayer[];
      };
    }
  | { type: "movementSnapshot"; data: {
      instanceId: string;
      sequence: number;
      serverTime: number;
      keyframe: boolean;
      players: (Partial<Pick<PublicPlayer, "x" | "y" | "moving" | "rotation">> & {
        userId: string;
        snapshotIntervalMs: 100 | 200 | 1000;
        moveSeq?: number;
        speed?: number;
        path?: { x: number; y: number }[];
        seated?: unknown;
        companion?: ({ id: string } & Partial<Pick<Companion, "x" | "y" | "state">> & {
          rotation?: number; followSpeed?: number;
        }) | null;
      })[];
    } }
  | { type: "playerJoined"; data: PublicPlayer }
  | { type: "playerLeft"; data: { userId: string } }
  | {
      type: "playerMoved";
      data: Pick<PublicPlayer, "userId" | "x" | "y" | "moving" | "companion">;
    }
  | { type: "playerEmoted"; data: { userId: string; text: string } }
  | {
      type: "mochiSpoke";
      data: {
        userId: string;
        mochiId: string;
        text: string;
        visibility: SpeechVisibility;
      };
    }
  | { type: "interaction"; data: { propId: string } }
  | { type: "error"; data: { message: string } };
export interface MochiDialogueInput {
  mochiId: string;
  userId: string;
  name: string;
  userMessage?: string;
  petState: {
    hunger: number;
    energy: number;
    happiness: number;
    boredom: number;
    stress: number;
  };
  personality: string[];
  preferences: Record<string, string>;
  location: string;
  recentConversation: { role: string; text: string }[];
  memories: { type: string; summary: string }[];
  tradingSummary: { currentAction?: string; recentReturn?: number };
}
export interface MochiDialogueResponse {
  text: string;
  mood?: string;
  animationHint?: string;
}
export interface MochiDialogueProvider {
  respond(input: MochiDialogueInput): Promise<MochiDialogueResponse>;
}
export interface GameCurrencyService {
  balance(
    userId: string,
    refresh?: boolean,
  ): Promise<{
    amountRaw: string;
    decimals: number;
    mint: string;
    mock: boolean;
  }>;
  intent(userId: string, purchase: object): Promise<object>;
  fulfill(
    userId: string,
    intentId: string,
    signature?: string,
  ): Promise<object>;
}
