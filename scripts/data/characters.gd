## 角色配置。旧版 CHARACTER_CONFIGS。
class_name Characters
extends RefCounted

const DEFS := {
	"megachad": {
		"hp": 100.0, "speed": 4.0, "damage": 1.2, "armor": 0.0,
		"crit_chance": 0.08, "weapon_slots": 2, "starting_weapon": "sword",
		"model_path": "res://assets/models/player_george.glb",
	},
	"roberto": {
		"hp": 150.0, "speed": 3.2, "damage": 1.0, "armor": 3.0,
		"crit_chance": 0.05, "weapon_slots": 2, "starting_weapon": "axe",
		"model_path": "res://assets/models/player_stan.glb",
	},
	"skateboard_skeleton": {
		"hp": 70.0, "speed": 5.0, "damage": 0.9, "armor": 0.0,
		"crit_chance": 0.10, "weapon_slots": 2, "starting_weapon": "bone_bouncer",
		"model_path": "res://assets/models/player_leela.glb",
	},
}


static func get_def(character_type: String) -> Dictionary:
	return DEFS.get(character_type, DEFS["megachad"]) as Dictionary
