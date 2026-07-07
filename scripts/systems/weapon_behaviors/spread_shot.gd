extends Node
## Shotgun: 前向扇形多弹（用 pistol projectile）。projectile_count 决定弹数。

var weapon_type: String = "shotgun"
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
	var pcount: int = int(stats["projectile_count"])
	var atk_range: float = float(stats["range"])
	var target: Node3D = WeaponUtil.find_nearest_enemy(player.global_position, get_tree(), atk_range)
	var dir: Vector3
	if target:
		dir = (target.global_position - player.global_position)
		dir.y = 0.0
		if dir.length() < 0.1:
			return
		dir = dir.normalized()
	else:
		dir = -player.global_transform.basis.z
		dir.y = 0.0
		dir = dir.normalized()

	var scene: PackedScene = preload("res://scenes/entities/projectile_bullet.tscn")
	# 扇形：中心弹 + 左右各半
	var spread_deg: float = 5.0
	for i in pcount:
		var offset: float = (i - (pcount - 1) * 0.5) * spread_deg
		var d: Vector3 = dir.rotated(Vector3.UP, deg_to_rad(offset))
		var proj: Node3D = scene.instantiate() as Node3D
		get_tree().current_scene.add_child(proj)
		proj.global_position = player.global_position + Vector3(0.0, 1.0, 0.0) + d * 0.6
		proj.setup(
			d, float(stats["speed"]), float(stats["damage"]),
			atk_range, int(stats["pierce"]), player,
		)
