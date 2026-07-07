## 任务表。旧版 data/quests.ts。跨局累积进度，奖励永久解锁 / 银币 / 武器槽。
class_name Quests
extends RefCounted

# reward 类型：silver / weapon_unlock / character_unlock / weapon_slot / tome_unlock
const QUESTS := [
	{"id": "q1", "desc_key": "quest.kill_100", "type": "kill", "target": 100, "reward_type": "silver", "reward_value": 50},
	{"id": "q2", "desc_key": "quest.kill_500", "type": "kill", "target": 500, "reward_type": "silver", "reward_value": 150},
	{"id": "q3", "desc_key": "quest.kill_1000", "type": "kill", "target": 1000, "reward_type": "silver", "reward_value": 200},
	{"id": "q4", "desc_key": "quest.kill_2500", "type": "kill", "target": 2500, "reward_type": "silver", "reward_value": 300},
	{"id": "q5", "desc_key": "quest.kill_5000", "type": "kill", "target": 5000, "reward_type": "silver", "reward_value": 400},
	{"id": "q6", "desc_key": "quest.kill_10000", "type": "kill", "target": 10000, "reward_type": "silver", "reward_value": 500},
	{"id": "q7", "desc_key": "quest.survive_2min", "type": "survive", "target": 120, "reward_type": "silver", "reward_value": 100},
	{"id": "q8", "desc_key": "quest.survive_5min", "type": "survive", "target": 300, "reward_type": "silver", "reward_value": 200},
	{"id": "q9", "desc_key": "quest.survive_7min", "type": "survive", "target": 420, "reward_type": "silver", "reward_value": 200},
	{"id": "q11", "desc_key": "quest.reach_level_10", "type": "level", "target": 10, "reward_type": "silver", "reward_value": 100},
	{"id": "q12", "desc_key": "quest.reach_level_20", "type": "level", "target": 20, "reward_type": "silver", "reward_value": 200},
	{"id": "q13", "desc_key": "quest.reach_level_30", "type": "level", "target": 30, "reward_type": "silver", "reward_value": 300},
	{"id": "q14", "desc_key": "quest.reach_level_40", "type": "level", "target": 40, "reward_type": "silver", "reward_value": 500},
	{"id": "q19", "desc_key": "quest.defeat_boss", "type": "boss", "target": 1, "reward_type": "silver", "reward_value": 200},
	{"id": "q20", "desc_key": "quest.defeat_boss_3", "type": "boss", "target": 3, "reward_type": "character_unlock", "reward_value": "roberto"},
	{"id": "q21", "desc_key": "quest.defeat_boss_5", "type": "boss", "target": 5, "reward_type": "silver", "reward_value": 500},
	{"id": "q22", "desc_key": "quest.defeat_boss_10", "type": "boss", "target": 10, "reward_type": "silver", "reward_value": 600},
	{"id": "q26", "desc_key": "quest.collect_500_silver", "type": "collect", "target": 500, "reward_type": "silver", "reward_value": 100},
	{"id": "q27", "desc_key": "quest.collect_2000_silver", "type": "collect", "target": 2000, "reward_type": "silver", "reward_value": 250},
	{"id": "q28", "desc_key": "quest.collect_5000_silver", "type": "collect", "target": 5000, "reward_type": "silver", "reward_value": 500},
	{"id": "q29", "desc_key": "quest.collect_10000_silver", "type": "collect", "target": 10000, "reward_type": "silver", "reward_value": 1000},
	{"id": "q30", "desc_key": "quest.collect_25000_silver", "type": "collect", "target": 25000, "reward_type": "silver", "reward_value": 1500},
	{"id": "q31", "desc_key": "quest.use_7_weapons", "type": "weapons_used", "target": 7, "reward_type": "weapon_slot", "reward_value": 1},
]


static func get_progress(quest: Dictionary) -> int:
	## 从 SaveGame.data.stats 读对应进度。
	var stats: Dictionary = SaveGame.data.get("stats", {}) as Dictionary
	var qtype: String = quest["type"]
	match qtype:
		"kill":
			return int(stats.get("total_kills", 0))
		"survive":
			return int(stats.get("best_survival_time", 0.0))
		"level":
			return int(stats.get("highest_level", 0))
		"boss":
			return int(stats.get("bosses_defeated", 0))
		"collect":
			return int(SaveGame.get_silver())
		"weapons_used":
			return int((SaveGame.data.get("weapons_unlocked", []) as Array).size())
		"no_damage":
			return int(stats.get("no_damage_runs", 0))
		"bond":
			return int(stats.get("bond_activations", 0))
	return 0


static func is_completed(quest_id: String) -> bool:
	return quest_id in (SaveGame.data.get("quests_completed", []) as Array)


static func check_completions() -> Array:
	## 扫全表，返回新完成的任务 id 列表；同时把奖励发放。
	var newly: Array = []
	for q in QUESTS:
		var qd: Dictionary = q as Dictionary
		var qid: String = qd["id"]
		if is_completed(qid):
			continue
		if get_progress(qd) >= int(qd["target"]):
			_grant_reward(qd)
			SaveGame.complete_quest(qid)
			newly.append(qid)
	return newly


static func _grant_reward(quest: Dictionary) -> void:
	var rtype: String = quest["reward_type"]
	var rvalue: Variant = quest["reward_value"]
	match rtype:
		"silver":
			SaveGame.add_silver(int(rvalue))
		"weapon_unlock":
			SaveGame.unlock_weapon(str(rvalue))
		"character_unlock":
			var chars: Array = SaveGame.data.get("characters_unlocked", []) as Array
			if not str(rvalue) in chars:
				chars.append(str(rvalue))
				SaveGame.save()
		"weapon_slot":
			SaveGame.data["extra_weapon_slots"] = int(SaveGame.data.get("extra_weapon_slots", 0)) + int(rvalue)
			SaveGame.save()
		"tome_unlock":
			var tomes: Array = SaveGame.data.get("tomes_unlocked", []) as Array
			if not str(rvalue) in tomes:
				tomes.append(str(rvalue))
				SaveGame.save()
