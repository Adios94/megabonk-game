## Character Traits 角色天赋。旧版 data/traits.ts。
## 每角色一个 passive，读玩家当前属性给出增量 bonus（每帧算一遍）。
class_name Traits
extends RefCounted


## 返回 { xp_bonus, crit_chance_bonus, crit_damage_bonus, attack_speed_bonus }
static func compute(player: Node) -> Dictionary:
	var char_id: String = GameManager.selected_character
	match char_id:
		"megachad":
			return _megachad(player)
		"roberto":
			return _roberto(player)
		"skateboard_skeleton":
			return _skateboard_skeleton(player)
	return {}


# megachad: 超出基础 dmg 的部分转 XP bonus（0.22 系数）
static func _megachad(player: Node) -> Dictionary:
	var dmg: float = float(player.damage_mult)
	var excess: float = maxf(0.0, dmg - 1.0)
	return {"xp_bonus": excess * 0.22}


# roberto: 护甲 → 暴击率（超出 100% 那部分转暴击伤害）
static func _roberto(player: Node) -> Dictionary:
	var armor_val: float = float(player.armor)
	var armor_points: float = maxf(0.0, armor_val) * 0.008
	var crit_chance: float = float(player.crit_chance)
	var crit_room: float = maxf(0.0, 1.0 - crit_chance)
	var crit_bonus: float = minf(armor_points, crit_room)
	var overflow: float = maxf(0.0, armor_points - crit_bonus)
	return {"crit_chance_bonus": crit_bonus, "crit_damage_bonus": overflow * 0.80}


# skateboard_skeleton: 超出基础速度的部分转攻速 bonus
static func _skateboard_skeleton(player: Node) -> Dictionary:
	var base_speed: float = 5.0 * 1.6   # 从 Characters.skateboard_skeleton.speed × PLAYER_MOVE_SPEED_MULTIPLIER
	var eff: float = float(player.move_speed)
	var excess: float = maxf(0.0, eff - base_speed)
	return {"attack_speed_bonus": excess * 0.025}
