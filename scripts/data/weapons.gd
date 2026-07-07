## 武器数值表。旧版 config.ts WEAPON_STATS + data/weapons.ts 合并。
## 每把武器有 8 级数值 + behavior id（对应 scripts/systems/weapon_behaviors/*.gd）。
class_name Weapons
extends RefCounted

# 每把武器每级的字段：damage / cooldown / projectile_count / bounces / chains
# / range / aoe_radius / pierce / speed
const STATS := {
	"sword": [
		{"damage": 16, "cooldown": 0.8, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 3.0, "aoe_radius": 3.0, "pierce": 999, "speed": 10},
		{"damage": 20, "cooldown": 0.8, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 3.7, "aoe_radius": 3.4, "pierce": 999, "speed": 11},
		{"damage": 23, "cooldown": 0.7, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 4.4, "aoe_radius": 3.8, "pierce": 999, "speed": 12},
		{"damage": 29, "cooldown": 0.7, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 5.1, "aoe_radius": 4.2, "pierce": 999, "speed": 14},
		{"damage": 34, "cooldown": 0.6, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 5.8, "aoe_radius": 4.6, "pierce": 999, "speed": 15},
		{"damage": 39, "cooldown": 0.6, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 6.5, "aoe_radius": 5.0, "pierce": 999, "speed": 17},
		{"damage": 46, "cooldown": 0.5, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 7.2, "aoe_radius": 5.5, "pierce": 999, "speed": 18},
		{"damage": 55, "cooldown": 0.5, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 8.0, "aoe_radius": 6.0, "pierce": 999, "speed": 20},
	],
	"bone_bouncer": [
		{"damage": 10, "cooldown": 1.2, "projectile_count": 1, "bounces": 2, "chains": 0, "range": 0, "aoe_radius": 0, "pierce": 0, "speed": 12},
		{"damage": 13, "cooldown": 1.1, "projectile_count": 1, "bounces": 2, "chains": 0, "range": 0, "aoe_radius": 0, "pierce": 0, "speed": 13},
		{"damage": 16, "cooldown": 1.0, "projectile_count": 1, "bounces": 3, "chains": 0, "range": 0, "aoe_radius": 0, "pierce": 0, "speed": 14},
		{"damage": 19, "cooldown": 0.9, "projectile_count": 1, "bounces": 3, "chains": 0, "range": 0, "aoe_radius": 0, "pierce": 0, "speed": 15},
		{"damage": 22, "cooldown": 0.8, "projectile_count": 2, "bounces": 4, "chains": 0, "range": 0, "aoe_radius": 0, "pierce": 0, "speed": 16},
		{"damage": 25, "cooldown": 0.7, "projectile_count": 2, "bounces": 4, "chains": 0, "range": 0, "aoe_radius": 0, "pierce": 0, "speed": 17},
		{"damage": 28, "cooldown": 0.65, "projectile_count": 2, "bounces": 5, "chains": 0, "range": 0, "aoe_radius": 0, "pierce": 0, "speed": 17},
		{"damage": 30, "cooldown": 0.6, "projectile_count": 3, "bounces": 6, "chains": 0, "range": 0, "aoe_radius": 0, "pierce": 0, "speed": 18},
	],
	# 轨道飞斧：pcount 把刀刃永久绕玩家旋转；cooldown = 单个刀对同敌重击间隔
	"axe": [
		{"damage": 10, "cooldown": 1.5, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 3.0, "aoe_radius": 1.0, "pierce": 999, "speed": 4.0},
		{"damage": 12, "cooldown": 1.5, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 3.0, "aoe_radius": 1.0, "pierce": 999, "speed": 4.0},
		{"damage": 14, "cooldown": 1.4, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 3.5, "aoe_radius": 1.0, "pierce": 999, "speed": 4.5},
		{"damage": 16, "cooldown": 1.3, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 3.5, "aoe_radius": 1.0, "pierce": 999, "speed": 4.5},
		{"damage": 18, "cooldown": 1.2, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 4.0, "aoe_radius": 1.0, "pierce": 999, "speed": 5.0},
		{"damage": 20, "cooldown": 1.1, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 4.0, "aoe_radius": 1.0, "pierce": 999, "speed": 5.0},
		{"damage": 22, "cooldown": 1.0, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 4.5, "aoe_radius": 1.0, "pierce": 999, "speed": 5.5},
		{"damage": 24, "cooldown": 0.9, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 5.0, "aoe_radius": 1.0, "pierce": 999, "speed": 6.0},
	],
	"pistol": [
		{"damage": 18, "cooldown": 1.2, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 20, "aoe_radius": 0, "pierce": 0, "speed": 25},
		{"damage": 22, "cooldown": 1.15, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 23, "aoe_radius": 0, "pierce": 0, "speed": 26},
		{"damage": 26, "cooldown": 1.1, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 26, "aoe_radius": 0, "pierce": 1, "speed": 27},
		{"damage": 30, "cooldown": 1.0, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 29, "aoe_radius": 0, "pierce": 1, "speed": 28},
		{"damage": 35, "cooldown": 0.95, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 32, "aoe_radius": 0, "pierce": 2, "speed": 29},
		{"damage": 40, "cooldown": 0.9, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 35, "aoe_radius": 0, "pierce": 2, "speed": 30},
		{"damage": 48, "cooldown": 0.85, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 38, "aoe_radius": 0, "pierce": 3, "speed": 32},
		{"damage": 58, "cooldown": 0.8, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 40, "aoe_radius": 0, "pierce": 4, "speed": 35},
	],
	"lightning_staff": [
		{"damage": 15, "cooldown": 1.8, "projectile_count": 1, "bounces": 0, "chains": 3, "range": 8, "aoe_radius": 0, "pierce": 0, "speed": 0},
		{"damage": 18, "cooldown": 1.6, "projectile_count": 1, "bounces": 0, "chains": 3, "range": 8, "aoe_radius": 0, "pierce": 0, "speed": 0},
		{"damage": 18, "cooldown": 1.4, "projectile_count": 1, "bounces": 0, "chains": 4, "range": 10, "aoe_radius": 0, "pierce": 0, "speed": 0},
		{"damage": 22, "cooldown": 1.2, "projectile_count": 1, "bounces": 0, "chains": 4, "range": 10, "aoe_radius": 0, "pierce": 0, "speed": 0},
		{"damage": 22, "cooldown": 1.0, "projectile_count": 1, "bounces": 0, "chains": 5, "range": 12, "aoe_radius": 0, "pierce": 0, "speed": 0},
		{"damage": 28, "cooldown": 0.8, "projectile_count": 1, "bounces": 0, "chains": 5, "range": 12, "aoe_radius": 0, "pierce": 0, "speed": 0},
		{"damage": 28, "cooldown": 0.7, "projectile_count": 1, "bounces": 0, "chains": 6, "range": 14, "aoe_radius": 0, "pierce": 0, "speed": 0},
		{"damage": 35, "cooldown": 0.6, "projectile_count": 1, "bounces": 0, "chains": 8, "range": 40, "aoe_radius": 0, "pierce": 0, "speed": 0},
	],
	"flame_ring": [
		{"damage": 4, "cooldown": 0.5, "projectile_count": 0, "bounces": 0, "chains": 0, "range": 3.5, "aoe_radius": 3.5, "pierce": 0, "speed": 0},
		{"damage": 5, "cooldown": 0.5, "projectile_count": 0, "bounces": 0, "chains": 0, "range": 3.5, "aoe_radius": 3.5, "pierce": 0, "speed": 0},
		{"damage": 5, "cooldown": 0.5, "projectile_count": 0, "bounces": 0, "chains": 0, "range": 4.5, "aoe_radius": 4.5, "pierce": 0, "speed": 0},
		{"damage": 7, "cooldown": 0.4, "projectile_count": 0, "bounces": 0, "chains": 0, "range": 4.5, "aoe_radius": 4.5, "pierce": 0, "speed": 0},
		{"damage": 7, "cooldown": 0.4, "projectile_count": 0, "bounces": 0, "chains": 0, "range": 5.5, "aoe_radius": 5.5, "pierce": 0, "speed": 0},
		{"damage": 9, "cooldown": 0.4, "projectile_count": 0, "bounces": 0, "chains": 0, "range": 5.5, "aoe_radius": 5.5, "pierce": 0, "speed": 0},
		{"damage": 9, "cooldown": 0.3, "projectile_count": 0, "bounces": 0, "chains": 0, "range": 6.5, "aoe_radius": 6.5, "pierce": 0, "speed": 0},
		{"damage": 16, "cooldown": 0.3, "projectile_count": 0, "bounces": 0, "chains": 0, "range": 8.0, "aoe_radius": 8.0, "pierce": 0, "speed": 0},
	],
	"shotgun": [
		{"damage": 16, "cooldown": 1.4, "projectile_count": 5, "bounces": 0, "chains": 0, "range": 12, "aoe_radius": 0, "pierce": 0, "speed": 18},
		{"damage": 18, "cooldown": 1.3, "projectile_count": 5, "bounces": 0, "chains": 0, "range": 13, "aoe_radius": 0, "pierce": 0, "speed": 21},
		{"damage": 20, "cooldown": 1.2, "projectile_count": 6, "bounces": 0, "chains": 0, "range": 14, "aoe_radius": 0, "pierce": 0, "speed": 24},
		{"damage": 23, "cooldown": 1.1, "projectile_count": 6, "bounces": 0, "chains": 0, "range": 15, "aoe_radius": 0, "pierce": 0, "speed": 27},
		{"damage": 26, "cooldown": 1.0, "projectile_count": 7, "bounces": 0, "chains": 0, "range": 16, "aoe_radius": 0, "pierce": 1, "speed": 30},
		{"damage": 29, "cooldown": 0.9, "projectile_count": 7, "bounces": 0, "chains": 0, "range": 17, "aoe_radius": 0, "pierce": 1, "speed": 33},
		{"damage": 32, "cooldown": 0.75, "projectile_count": 8, "bounces": 0, "chains": 0, "range": 18, "aoe_radius": 0, "pierce": 1, "speed": 36},
		{"damage": 36, "cooldown": 0.6, "projectile_count": 9, "bounces": 0, "chains": 0, "range": 20, "aoe_radius": 0, "pierce": 2, "speed": 38},
	],
	"ray_gun": [
		{"damage": 6, "cooldown": 1.5, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 8, "aoe_radius": 0.5, "pierce": 999, "speed": 0},
		{"damage": 9, "cooldown": 1.4, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 10, "aoe_radius": 0.52, "pierce": 999, "speed": 0},
		{"damage": 12, "cooldown": 1.3, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 12, "aoe_radius": 0.54, "pierce": 999, "speed": 0},
		{"damage": 15, "cooldown": 1.2, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 14, "aoe_radius": 0.55, "pierce": 999, "speed": 0},
		{"damage": 18, "cooldown": 1.1, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 15, "aoe_radius": 0.56, "pierce": 999, "speed": 0},
		{"damage": 21, "cooldown": 1.0, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 16, "aoe_radius": 0.58, "pierce": 999, "speed": 0},
		{"damage": 24, "cooldown": 0.95, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 17, "aoe_radius": 0.59, "pierce": 999, "speed": 0},
		{"damage": 26, "cooldown": 0.9, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 18, "aoe_radius": 0.6, "pierce": 999, "speed": 0},
	],
	# damage = DoT dps；aoe_radius = 云半径；range = 投掷距离
	"poison_bomb": [
		{"damage": 6, "cooldown": 2.0, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 10, "aoe_radius": 3.0, "pierce": 0, "speed": 0},
		{"damage": 8, "cooldown": 1.9, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 12, "aoe_radius": 3.0, "pierce": 0, "speed": 0},
		{"damage": 11, "cooldown": 1.8, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 14, "aoe_radius": 3.3, "pierce": 0, "speed": 0},
		{"damage": 14, "cooldown": 1.7, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 16, "aoe_radius": 3.6, "pierce": 0, "speed": 0},
		{"damage": 18, "cooldown": 1.6, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 18, "aoe_radius": 3.9, "pierce": 0, "speed": 0},
		{"damage": 22, "cooldown": 1.5, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 20, "aoe_radius": 4.2, "pierce": 0, "speed": 0},
		{"damage": 27, "cooldown": 1.45, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 22, "aoe_radius": 4.5, "pierce": 0, "speed": 0},
		{"damage": 34, "cooldown": 1.4, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 24, "aoe_radius": 4.8, "pierce": 0, "speed": 0},
	],
	"paralysis_gun": [
		{"damage": 14, "cooldown": 1.1, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 24, "aoe_radius": 0, "pierce": 0, "speed": 26},
		{"damage": 17, "cooldown": 1.05, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 26, "aoe_radius": 0, "pierce": 0, "speed": 27},
		{"damage": 20, "cooldown": 1.0, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 28, "aoe_radius": 0, "pierce": 1, "speed": 28},
		{"damage": 23, "cooldown": 0.95, "projectile_count": 2, "bounces": 0, "chains": 0, "range": 30, "aoe_radius": 0, "pierce": 1, "speed": 29},
		{"damage": 27, "cooldown": 0.9, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 31, "aoe_radius": 0, "pierce": 2, "speed": 30},
		{"damage": 31, "cooldown": 0.85, "projectile_count": 3, "bounces": 0, "chains": 0, "range": 32, "aoe_radius": 0, "pierce": 2, "speed": 31},
		{"damage": 35, "cooldown": 0.78, "projectile_count": 4, "bounces": 0, "chains": 0, "range": 33, "aoe_radius": 0, "pierce": 3, "speed": 33},
		{"damage": 38, "cooldown": 0.7, "projectile_count": 4, "bounces": 0, "chains": 0, "range": 34, "aoe_radius": 0, "pierce": 3, "speed": 35},
	],
	"void_ripple": [
		{"damage": 12, "cooldown": 2.2, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 4.0, "pierce": 0, "speed": 8.0},
		{"damage": 15, "cooldown": 2.1, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 4.4, "pierce": 0, "speed": 8.5},
		{"damage": 18, "cooldown": 2.0, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 4.8, "pierce": 0, "speed": 9.0},
		{"damage": 21, "cooldown": 1.9, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 5.2, "pierce": 0, "speed": 9.5},
		{"damage": 24, "cooldown": 1.8, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 5.6, "pierce": 0, "speed": 10.0},
		{"damage": 28, "cooldown": 1.7, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 6.1, "pierce": 0, "speed": 10.5},
		{"damage": 32, "cooldown": 1.6, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 6.5, "pierce": 0, "speed": 11.0},
		{"damage": 36, "cooldown": 1.5, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 7.0, "pierce": 0, "speed": 12.0},
	],
	"scorch_boots": [
		{"damage": 5, "cooldown": 0.3, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 0.9, "pierce": 0, "speed": 0},
		{"damage": 6, "cooldown": 0.3, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 1.0, "pierce": 0, "speed": 0},
		{"damage": 7, "cooldown": 0.28, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 1.1, "pierce": 0, "speed": 0},
		{"damage": 9, "cooldown": 0.28, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 1.2, "pierce": 0, "speed": 0},
		{"damage": 11, "cooldown": 0.26, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 1.3, "pierce": 0, "speed": 0},
		{"damage": 13, "cooldown": 0.26, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 1.4, "pierce": 0, "speed": 0},
		{"damage": 16, "cooldown": 0.24, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 1.5, "pierce": 0, "speed": 0},
		{"damage": 20, "cooldown": 0.22, "projectile_count": 1, "bounces": 0, "chains": 0, "range": 0, "aoe_radius": 2.0, "pierce": 0, "speed": 0},
	],
}

# 每把武器的 behavior id → scripts/systems/weapon_behaviors/*.gd
const BEHAVIORS := {
	"sword": "sweep_arc",
	"bone_bouncer": "bouncing_shot",
	"axe": "orbiting_axe",
	"pistol": "forward_arrow",
	"lightning_staff": "lightning_chain",
	"flame_ring": "flame_aura",
	"shotgun": "spread_shot",
	"ray_gun": "ray_beam",
	"poison_bomb": "poison_gas",
	"paralysis_gun": "paralysis_shot",
	"void_ripple": "void_ripple",
	"scorch_boots": "scorch_trail",
}

const TAGS := {
	"sword": ["sword", "melee", "physical"],
	"bone_bouncer": ["bone_bouncer", "projectile", "bouncing"],
	"axe": ["axe", "projectile", "orbiting", "melee"],
	"pistol": ["pistol", "projectile", "physical", "piercing"],
	"lightning_staff": ["lightning_staff", "spell", "lightning", "chain"],
	"flame_ring": ["flame_ring", "spell", "fire", "aoe"],
	"shotgun": ["shotgun", "projectile", "spread"],
	"ray_gun": ["ray_gun", "beam", "energy", "piercing"],
	"poison_bomb": ["poison_bomb", "spell", "poison", "aoe", "dot"],
	"paralysis_gun": ["paralysis_gun", "projectile", "energy", "control"],
	"void_ripple": ["void_ripple", "spell", "void", "aoe"],
	"scorch_boots": ["scorch_boots", "fire", "aoe", "trail", "dot"],
}

const ALL_WEAPON_TYPES := [
	"sword", "bone_bouncer", "axe", "pistol",
	"lightning_staff", "flame_ring", "shotgun",
	"ray_gun", "poison_bomb", "paralysis_gun",
	"void_ripple", "scorch_boots",
]


static func get_stats(weapon_type: String, level: int) -> Dictionary:
	var stats: Array = STATS.get(weapon_type, [])
	var idx: int = clamp(level - 1, 0, stats.size() - 1)
	return stats[idx] if stats.size() > 0 else {}


static func get_behavior(weapon_type: String) -> String:
	return BEHAVIORS.get(weapon_type, "")
