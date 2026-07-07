extends Node
## Bone Bouncer: 直线投射物，命中后向随机方向反弹到下一敌人。

var weapon_type: String = "bone_bouncer"
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
	var target: Node3D = WeaponUtil.find_nearest_enemy(player.global_position, get_tree(), 30.0)
	var dir: Vector3
	if target:
		dir = (target.global_position - player.global_position)
		dir.y = 0.0
		dir = dir.normalized()
	else:
		dir = -player.global_transform.basis.z
		dir.y = 0.0
		dir = dir.normalized()

	for i in pcount:
		var spread: float = deg_to_rad((i - (pcount - 1) * 0.5) * 8.0)
		var d: Vector3 = dir.rotated(Vector3.UP, spread)
		_spawn_bone(d, stats)


func _spawn_bone(dir: Vector3, stats: Dictionary) -> void:
	var scene: PackedScene = preload("res://scenes/entities/projectile_bone.tscn")
	var proj: Node3D = scene.instantiate() as Node3D
	get_tree().current_scene.add_child(proj)
	proj.global_position = player.global_position + Vector3(0.0, 1.0, 0.0) + dir * 0.6
	proj.setup(
		dir,
		float(stats["speed"]),
		float(stats["damage"]),
		int(stats["bounces"]),
		player,
	)
