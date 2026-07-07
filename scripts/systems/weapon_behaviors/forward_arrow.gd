extends Node
## Pistol: 前向直射投射物。找最近敌人瞄，projectile 直线飞行，命中扣血 + 穿透计数。

var weapon_type: String = "pistol"
var player: Node3D

var _cd_timer := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	if player == null:
		return
	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return
	_cd_timer -= delta * player.attack_speed_mult
	if _cd_timer > 0.0:
		return
	_cd_timer = stats["cooldown"]
	_fire(stats)


func _get_level() -> int:
	for w in player.weapons:
		if w["type"] == weapon_type:
			return w["level"]
	return 1


func _fire(stats: Dictionary) -> void:
	var target := WeaponUtil.find_nearest_enemy(player.global_position, get_tree(), stats["range"])
	if target == null:
		return
	var dir := (target.global_position - player.global_position)
	dir.y = 0.0
	if dir.length() < 0.1:
		return
	dir = dir.normalized()
	for i in stats["projectile_count"]:
		var spread := deg_to_rad((i - (stats["projectile_count"] - 1) * 0.5) * 6.0)
		var d := dir.rotated(Vector3.UP, spread)
		_spawn_projectile(d, stats)


func _spawn_projectile(dir: Vector3, stats: Dictionary) -> void:
	var proj := preload("res://scenes/entities/projectile_bullet.tscn").instantiate()
	get_tree().current_scene.add_child(proj)
	proj.global_position = player.global_position + Vector3(0.0, 1.0, 0.0) + dir * 0.6
	proj.setup(
		dir,
		stats["speed"],
		stats["damage"],
		stats["range"],
		stats["pierce"],
		player,
	)
