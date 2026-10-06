// Adapter for existing authoritative combatEffect packets and named action events.
// Nothing here sends commands, chooses a battle action or computes damage.
export function animationCommands(event) {
  const player = "player:" + event.userId,
    pet = "pet",
    mob = event.targetId ?? event.mobId;
  const weapon = event.weaponType ?? "sword";
  const command = (actor, state, extra = {}) => ({ actor, state, ...extra });
  switch (event.kind) {
    case "hit":
    case "player_attack":
      return [command(player, weapon), command(mob, "hurt")];
    case "spell":
    case "spell_cast":
      return [command(player, "cast"), ...(mob ? [command(mob, "hurt")] : [])];
    case "pet-hit":
    case "mochi_attack":
      return [command(pet, "attack"), command(mob, "hurt")];
    case "pet-special":
    case "mochi_special":
      return [command(pet, "special"), command(mob, "hurt")];
    case "mob-hit":
      return [
        ...(event.poison ? [] : [command(mob, "attack")]),
        command(
          event.pet ? pet : player,
          event.defeated ? "defeat" : event.defended ? "defend" : "hurt",
        ),
      ];
    case "mob_attack":
      return [command(mob, "attack")];
    case "damage_taken":
      return [
        command(
          event.actorId ?? (event.pet ? pet : player),
          event.defeated ? "defeat" : "hurt",
        ),
      ];
    case "defend":
      return [
        command(
          event.pet ? pet : player,
          event.owner ? "defend-owner" : event.pet ? "defend-self" : "defend",
        ),
      ];
    case "victory":
    case "mob_defeated":
      return [command(mob, "defeat")];
    case "item_use":
      return [command(player, "item")];
    case "interact":
      return [command(player, "interact")];
    case "fish_start":
      return [command(player, "fish-cast", { duration: 0.8 })];
    case "fishing":
    case "fish_catch":
      return [command(player, "fish-catch")];
    case "woodcut_start":
      return [command(player, "chop")];
    case "woodcutting":
    case "woodcut_complete":
      return [command(player, "chop-recover")];
    case "gather_cancel":
      return [command(player, null)];
    default:
      return [];
  }
}
