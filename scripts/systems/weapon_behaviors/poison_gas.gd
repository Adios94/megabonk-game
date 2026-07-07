extends Node
## Poison Bomb: 每 CD 一次，在最近敌人位置或前方投毒气云；云每 0.5s 对内敌人扣 DoT。

var weapon_type: String = "poison_bomb"
var player: Node3D
var sfx_key: String = ""

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
	if sfx_key != "": Audio.play_sfx(sfx_key, 0.1)
	_fire(stats)


func _get_level() -> int:
	for w in player.weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type:
			return int(wd["level"])
	return 1


func _fire(stats: Dictionary) -> void:
	var pcount: int = int(stats["projectile_count"])
	var throw_range: float = float(stats["range"])
	var aoe: float = float(stats["aoe_radius"])
	var dps: float = float(stats["damage"])

	for i in pcount:
		# 尽量选没被别的云覆盖的敌人
		var target: Node3D = WeaponUtil.find_nearest_enemy(player.global_position, get_tree(), throw_range)
		var pos: Vector3
		if target:
			pos = target.global_position + Vector3(_rng.randf_range(-2.0, 2.0), 0.0, _rng.randf_range(-2.0, 2.0))
		else:
			var a: float = _rng.randf() * TAU
			pos = player.global_position + Vector3(cos(a), 0.0, sin(a)) * throw_range * 0.5
		pos.y = 0.5
		_spawn_cloud(pos, aoe, dps)


func _spawn_cloud(pos: Vector3, radius: float, dps: float) -> void:
	var scene: PackedScene = preload("res://scenes/entities/poison_cloud.tscn")
	var c: Node3D = scene.instantiate() as Node3D
	get_tree().current_scene.add_child(c)
	c.global_position = pos
	c.setup(radius, dps, player)
