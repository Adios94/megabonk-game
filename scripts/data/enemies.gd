## 敌人数值表。旧版 data/enemies.ts。
class_name Enemies
extends RefCounted

# 6 种敌人。字段：hp / damage / speed / behavior / xp_reward / attack_cooldown
# / is_elite / first_appear / spawn_weight / preferred_range / modifier / tags
const ENEMY_DEFS := {
	"skeleton_soldier": {
		"hp": 15.0, "damage": 5.0, "speed": 3.0, "behavior": "chase",
		"xp_reward": 1, "attack_cooldown": 1.5, "is_elite": false,
		"first_appear": 0.0, "spawn_weight": 40,
		"tags": ["undead", "physical"],
	},
	"zombie": {
		"hp": 30.0, "damage": 10.0, "speed": 1.5, "behavior": "chase",
		"xp_reward": 5, "attack_cooldown": 2.5, "is_elite": false,
		"first_appear": 60.0, "spawn_weight": 25,
		"tags": ["undead", "physical"],
	},
	"skeleton_archer": {
		"hp": 12.0, "damage": 7.0, "speed": 2.5, "behavior": "ranged",
		"xp_reward": 5, "attack_cooldown": 3.0, "is_elite": false,
		"first_appear": 120.0, "spawn_weight": 15, "preferred_range": 8.0,
		"tags": ["undead", "ranged"],
	},
	"skeleton_knight": {
		"hp": 120.0, "damage": 20.0, "speed": 3.5, "behavior": "charge",
		"xp_reward": 10, "attack_cooldown": 2.0, "is_elite": true,
		"first_appear": 180.0, "spawn_weight": 5,
		"tags": ["undead", "physical", "elite"],
	},
	"necromancer": {
		"hp": 80.0, "damage": 15.0, "speed": 2.0, "behavior": "ranged",
		"modifier": "necromancer",
		"xp_reward": 20, "attack_cooldown": 4.0, "is_elite": true,
		"first_appear": 240.0, "spawn_weight": 3, "preferred_range": 10.0,
		"tags": ["undead", "spell", "elite"],
	},
	"gargoyle": {
		"hp": 200.0, "damage": 25.0, "speed": 3.2, "behavior": "dive",
		"xp_reward": 20, "attack_cooldown": 3.0, "is_elite": true,
		"first_appear": 300.0, "spawn_weight": 6,
		"tags": ["flying", "elite"],
	},
}


static func get_def(enemy_type: String) -> Dictionary:
	return ENEMY_DEFS.get(enemy_type, {}) as Dictionary
