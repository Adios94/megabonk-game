extends Node
## 存档系统。user://save.json 存永久数据（银币、商店等级、任务、解锁）。
## 对应旧版 services/save.ts。

const SAVE_PATH := "user://save.json"
const SAVE_VERSION := 1

var data: Dictionary = {}


func _ready() -> void:
	load_save()


func default_data() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"silver": 0,
		"shop_levels": {},                   # shop_upgrade_id → level
		"quests_completed": [],              # quest_id array
		"weapons_unlocked": ["sword", "bone_bouncer", "axe"],
		"characters_unlocked": ["megachad"],
		"tomes_unlocked": [],
		"extra_weapon_slots": 0,             # 任务奖励，与角色 max_weapon_slots 相加
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
	var text := FileAccess.get_file_as_string(SAVE_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		data = default_data()
		return
	# 补齐缺字段
	var defaults := default_data()
	for k in defaults:
		if not parsed.has(k):
			parsed[k] = defaults[k]
	data = parsed


func save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_error("[SaveGame] 无法写入 %s" % SAVE_PATH)
		return
	f.store_string(JSON.stringify(data, "\t"))


func reset() -> void:
	data = default_data()
	save()


# --- 便利方法 ---

func get_silver() -> int:
	return data.get("silver", 0)


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
	return data.get("shop_levels", {}).get(id, 0)


func increment_shop_level(id: String) -> void:
	if not data.has("shop_levels"):
		data["shop_levels"] = {}
	data["shop_levels"][id] = get_shop_level(id) + 1
	save()


func is_weapon_unlocked(id: String) -> bool:
	return id in data.get("weapons_unlocked", [])


func unlock_weapon(id: String) -> void:
	if not is_weapon_unlocked(id):
		data.get("weapons_unlocked", []).append(id)
		save()


func complete_quest(id: String) -> void:
	if not id in data.get("quests_completed", []):
		data.get("quests_completed", []).append(id)
		save()


func record_run_end(seconds: float, level: int, kills: int) -> void:
	var s: Dictionary = data.get("stats", {})
	s["total_runs"] = s.get("total_runs", 0) + 1
	s["total_kills"] = s.get("total_kills", 0) + kills
	s["best_survival_time"] = max(s.get("best_survival_time", 0.0), seconds)
	s["highest_level"] = max(s.get("highest_level", 0), level)
	data["stats"] = s
	save()
