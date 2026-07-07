extends Node
## Scorch Boots: 玩家脚下高频留下灼地痕迹，敌人踩上去扣血。

var weapon_type: String = "scorch_boots"
var player: Node3D

var _cd_timer: float = 0.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _last_place_pos: Vector3 = Vector3.ZERO


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
	# 玩家静止时不留痕
	if player.global_position.distance_to(_last_place_pos) < 0.3:
		return
	_cd_timer = float(stats["cooldown"])
	_place_trail(stats)


func _get_level() -> int:
	for w in player.weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type:
			return int(wd["level"])
	return 1


func _place_trail(stats: Dictionary) -> void:
	_last_place_pos = player.global_position
	var scene: PackedScene = preload("res://scenes/entities/scorch_trail.tscn")
	var t: Node3D = scene.instantiate() as Node3D
	get_tree().current_scene.add_child(t)
	t.global_position = player.global_position + Vector3(0.0, 0.05, 0.0)
	t.setup(
		float(stats["aoe_radius"]),
		float(stats["damage"]),
		player,
	)
