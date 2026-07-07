extends Node3D
## 简单直线投射物。命中扣血、穿透计数、超程销毁。

var _dir := Vector3.ZERO
var _speed := 20.0
var _damage := 10.0
var _remaining_range := 40.0
var _pierce_left := 0
var _hit_ids: Dictionary = {}   # instance_id → true
var _player: Node
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func setup(dir: Vector3, speed: float, damage: float, max_range: float, pierce: int, player: Node) -> void:
	_dir = dir
	_speed = speed
	_damage = damage
	_remaining_range = max_range
	_pierce_left = pierce
	_player = player


func _process(delta: float) -> void:
	var step := _speed * delta
	global_position += _dir * step
	_remaining_range -= step

	# 命中检测：附近半径 0.8 的敌人
	for e in WeaponUtil.find_enemies_in_radius(global_position, 0.8, get_tree()):
		var eid: int = e.get_instance_id()
		if _hit_ids.has(eid):
			continue
		_hit_ids[eid] = true
		WeaponUtil.deal_damage(e, _damage, _player, _rng, global_position)
		if _pierce_left <= 0:
			queue_free()
			return
		_pierce_left -= 1

	if _remaining_range <= 0.0:
		queue_free()
