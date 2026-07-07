extends Node
## Void Ripple: 玩家为圆心，每 CD 一次向外扩散的环形波。半径从 0 长到 aoe_radius，扫过时对敌人扣血。

var weapon_type: String = "void_ripple"
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
	var scene: PackedScene = preload("res://scenes/entities/void_wave.tscn")
	var w: Node3D = scene.instantiate() as Node3D
	get_tree().current_scene.add_child(w)
	w.global_position = player.global_position + Vector3(0.0, 0.1, 0.0)
	w.setup(
		float(stats["aoe_radius"]),
		float(stats["speed"]),
		float(stats["damage"]),
		player,
	)
