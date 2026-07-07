## 商店永久升级。旧版 data/shop.ts SHOP_UPGRADES。
class_name Shop
extends RefCounted

const UPGRADES := [
	{
		"id": "max_hp", "name_key": "shop.max_hp", "desc_key": "shop.max_hp_desc",
		"max_level": 10,
		"cost_per_level": [50, 100, 150, 200, 300, 400, 500, 650, 800, 1000],
		"stat": "max_hp", "value_per_level": 10.0,
	},
	{
		"id": "damage", "name_key": "shop.damage", "desc_key": "shop.damage_desc",
		"max_level": 10,
		"cost_per_level": [80, 160, 240, 320, 400, 500, 600, 750, 900, 1200],
		"stat": "damage", "value_per_level": 0.05,
	},
	{
		"id": "speed", "name_key": "shop.speed", "desc_key": "shop.speed_desc",
		"max_level": 5,
		"cost_per_level": [100, 200, 350, 500, 700],
		"stat": "speed", "value_per_level": 0.3,
	},
	{
		"id": "crit", "name_key": "shop.crit", "desc_key": "shop.crit_desc",
		"max_level": 5,
		"cost_per_level": [120, 250, 400, 600, 900],
		"stat": "crit_chance", "value_per_level": 0.02,
	},
	{
		"id": "pickup_radius", "name_key": "shop.pickup", "desc_key": "shop.pickup_desc",
		"max_level": 5,
		"cost_per_level": [60, 120, 200, 300, 450],
		"stat": "pickup_radius", "value_per_level": 0.5,
	},
	{
		"id": "armor", "name_key": "shop.armor", "desc_key": "shop.armor_desc",
		"max_level": 5,
		"cost_per_level": [100, 200, 350, 500, 750],
		"stat": "armor", "value_per_level": 1.0,
	},
	{
		"id": "xp_gain", "name_key": "shop.xp_gain", "desc_key": "shop.xp_gain_desc",
		"max_level": 5,
		"cost_per_level": [80, 160, 300, 450, 650],
		"stat": "xp_gain", "value_per_level": 0.1,
	},
	{
		"id": "starting_level", "name_key": "shop.start_level", "desc_key": "shop.start_level_desc",
		"max_level": 3,
		"cost_per_level": [500, 1000, 2000],
		"stat": "start_level", "value_per_level": 1.0,
	},
]


static func get_upgrade(id: String) -> Dictionary:
	for u in UPGRADES:
		if u["id"] == id:
			return u
	return {}


static func get_next_cost(id: String, current_level: int) -> int:
	var u := get_upgrade(id)
	if u.is_empty():
		return -1
	if current_level >= (u["max_level"] as int):
		return -1
	return (u["cost_per_level"] as Array)[current_level]
