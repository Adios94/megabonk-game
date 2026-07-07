extends Node
## Paralysis Gun: 自动索敌投射物，命中施加减速（简化：暂时不实装减速状态，只当高伤单发）。
## 未来扩展：命中后 target.move_speed *= 0.2 持续 1.5s（旧版 PARALYSIS_SLOW_*）。

var weapon_type: String = "paralysis_gun"
var player: Node3D

var _cd_timer: float = 0.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	if player == null:
		return
	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return
	_cd_timer -= delta * float(player.attack_speed_mult)
	if _cd_timer > 0.0:
		return
	_cd_timer = float(stats["cooldown"])
	_fire(stats)


func _get_level() -> int:
	for w in player.weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type:
			return int(wd["level"])
	return 1


func _fire(stats: Dictionary) -> void:
	var atk_range: float = float(stats["range"])
	var pcount: int = int(stats["projectile_count"])
	var scene: PackedScene = preload("res://scenes/entities/projectile_paralysis.tscn")

	for i in pcount:
		var target: Node3D = _find_target_excluding(atk_range, _find_recent_targets(pcount, i))
		var start: Vector3 = player.global_position + Vector3(0.0, 1.0, 0.0)
		var dir: Vector3
		if target:
			dir = (target.global_position - start)
			dir.y = 0.0
			dir = dir.normalized()
		else:
			var a: float = _rng.randf() * TAU
			dir = Vector3(cos(a), 0.0, sin(a))

		var proj: Node3D = scene.instantiate() as Node3D
		get_tree().current_scene.add_child(proj)
		proj.global_position = start + dir * 0.6
		proj.setup(
			dir, float(stats["speed"]), float(stats["damage"]),
			atk_range, int(stats["pierce"]), player,
		)


# 简化：每颗独立找最近敌人，不去重
func _find_target_excluding(rng_range: float, _excluded: Array) -> Node3D:
	return WeaponUtil.find_nearest_enemy(player.global_position, get_tree(), rng_range)


func _find_recent_targets(_count: int, _idx: int) -> Array:
	return []
