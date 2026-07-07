extends Node
## Pistol: 前向直射投射物。找最近敌人瞄，projectile 直线飞行，命中扣血 + 穿透计数。

var weapon_type: String = "pistol"
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
	var target: Node3D = WeaponUtil.find_nearest_enemy(player.global_position, get_tree(), atk_range)
	if target == null:
		return
	var to_target: Vector3 = target.global_position - player.global_position
	to_target.y = 0.0
	if to_target.length() < 0.1:
		return
	var dir: Vector3 = to_target.normalized()
	var pcount: int = int(stats["projectile_count"])
	for i in pcount:
		var spread: float = deg_to_rad((i - (pcount - 1) * 0.5) * 6.0)
		var d: Vector3 = dir.rotated(Vector3.UP, spread)
		_spawn_projectile(d, stats)


func _spawn_projectile(dir: Vector3, stats: Dictionary) -> void:
	var proj: Node3D = preload("res://scenes/entities/projectile_bullet.tscn").instantiate()
	get_tree().current_scene.add_child(proj)
	proj.global_position = player.global_position + Vector3(0.0, 1.0, 0.0) + dir * 0.6
	proj.setup(
		dir,
		float(stats["speed"]),
		float(stats["damage"]),
		float(stats["range"]),
		int(stats["pierce"]),
		player,
	)
