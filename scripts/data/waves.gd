## 波次配置。旧版 config.ts WAVE_CONFIGS。
class_name Waves
extends RefCounted

const CONFIGS := [
	{
		"time_start": 0.0, "time_end": 60.0, "spawn_interval": 2.0, "max_alive": 30,
		"enemies": ["skeleton_soldier"],
		"group_size": [1, 3], "elite_chance": 0.0,
	},
	{
		"time_start": 60.0, "time_end": 180.0, "spawn_interval": 1.5, "max_alive": 50,
		"enemies": ["skeleton_soldier", "zombie"],
		"group_size": [2, 4], "elite_chance": 0.05,
	},
	{
		"time_start": 180.0, "time_end": 300.0, "spawn_interval": 1.2, "max_alive": 70,
		"enemies": ["skeleton_soldier", "zombie", "skeleton_archer"],
		"group_size": [3, 5], "elite_chance": 0.1,
	},
	{
		"time_start": 300.0, "time_end": 420.0, "spawn_interval": 1.0, "max_alive": 85,
		"enemies": ["zombie", "skeleton_archer", "skeleton_soldier", "gargoyle"],
		"group_size": [3, 6], "elite_chance": 0.15,
	},
	{
		"time_start": 420.0, "time_end": 540.0, "spawn_interval": 0.8, "max_alive": 100,
		"enemies": ["zombie", "skeleton_archer", "skeleton_soldier", "gargoyle"],
		"group_size": [4, 8], "elite_chance": 0.2,
	},
]


static func get_wave_at(time_seconds: float) -> Dictionary:
	for w in CONFIGS:
		var wd: Dictionary = w as Dictionary
		if time_seconds >= float(wd["time_start"]) and time_seconds < float(wd["time_end"]):
			return wd
	return CONFIGS[-1] as Dictionary
