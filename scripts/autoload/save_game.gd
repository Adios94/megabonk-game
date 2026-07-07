extends Node
## 存档系统。user://save.json 存永久数据（银币、商店等级、任务、解锁）。

const SAVE_PATH := "user://save.json"
const SAVE_VERSION := 1

var data: Dictionary = {}


func _ready() -> void:
	load_save()


func default_data() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"silver": 0,
		"shop_levels": {},
		"quests_completed": [],
		"weapons_unlocked": ["sword", "bone_bouncer", "axe"],
		"characters_unlocked": ["megachad"],
		"tomes_unlocked": [],
		"extra_weapon_slots": 0,
		"stats": {
			"total_kills": 0,
			"total_runs": 0,
			"best_survival_time": 0.0,
			"highest_level": 0,
			"bosses_defeated": 0,
			"total_evolutions": 0,
		},
		"locale": "zh",
	}


func load_save() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		data = default_data()
		return
	var text: String = FileAccess.get_file_as_string(SAVE_PATH)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		data = default_data()
		return
	var parsed_dict: Dictionary = parsed as Dictionary
	var defaults: Dictionary = default_data()
	for k in defaults:
		if not parsed_dict.has(k):
			parsed_dict[k] = defaults[k]
	data = parsed_dict


func save() -> void:
	var f: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_error("[SaveGame] 无法写入 %s" % SAVE_PATH)
		return
	f.store_string(JSON.stringify(data, "\t"))


func reset() -> void:
	data = default_data()
	save()


# --- 便利方法 ---

func get_silver() -> int:
	return int(data.get("silver", 0))


func add_silver(amount: int) -> void:
	data["silver"] = get_silver() + amount
	save()


func spend_silver(amount: int) -> bool:
	if get_silver() < amount:
		return false
	data["silver"] = get_silver() - amount
	save()
	return true


func get_shop_level(id: String) -> int:
	var levels: Dictionary = data.get("shop_levels", {}) as Dictionary
	return int(levels.get(id, 0))


func increment_shop_level(id: String) -> void:
	if not data.has("shop_levels"):
		data["shop_levels"] = {}
	(data["shop_levels"] as Dictionary)[id] = get_shop_level(id) + 1
	save()


func is_weapon_unlocked(id: String) -> bool:
	return id in (data.get("weapons_unlocked", []) as Array)


func unlock_weapon(id: String) -> void:
	if not is_weapon_unlocked(id):
		(data["weapons_unlocked"] as Array).append(id)
		save()


func complete_quest(id: String) -> void:
	var done: Array = data.get("quests_completed", []) as Array
	if not id in done:
		done.append(id)
		save()


func record_run_end(seconds: float, level: int, kills: int) -> void:
	var s: Dictionary = data.get("stats", {}) as Dictionary
	s["total_runs"] = int(s.get("total_runs", 0)) + 1
	s["total_kills"] = int(s.get("total_kills", 0)) + kills
	s["best_survival_time"] = maxf(float(s.get("best_survival_time", 0.0)), seconds)
	s["highest_level"] = maxi(int(s.get("highest_level", 0)), level)
	data["stats"] = s
	save()
