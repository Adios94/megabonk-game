extends Node3D
## 弹射骨头。命中一个敌人 → 找 6m 内下一敌人 → 转向。bounces 用尽后消失。

var _dir: Vector3 = Vector3.ZERO
var _speed: float = 12.0
var _damage: float = 10.0
var _bounces_left: int = 2
var _lifetime: float = 4.0
var _hit_ids: Dictionary = {}
var _player: Node
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

const BOUNCE_SEARCH_RADIUS := 6.0


func _ready() -> void:
	_rng.randomize()


func setup(dir: Vector3, speed: float, damage: float, bounces: int, player: Node) -> void:
	_dir = dir
	_speed = speed
	_damage = damage
	_bounces_left = bounces
	_player = player


func _process(delta: float) -> void:
	_lifetime -= delta
	if _lifetime <= 0.0:
		queue_free()
		return

	var step: float = _speed * delta
	global_position += _dir * step
	rotation.y += 12.0 * delta   # 自转

	# 命中检测：半径 0.8 内的敌人
	for e in WeaponUtil.find_enemies_in_radius(global_position, 0.8, get_tree()):
		var eid: int = e.get_instance_id()
		if _hit_ids.has(eid):
			continue
		_hit_ids[eid] = true
		WeaponUtil.deal_damage(e as Node, _damage, _player, _rng, global_position)
		if _bounces_left <= 0:
			queue_free()
			return
		_bounces_left -= 1
		_find_next_target(e)
		return


func _find_next_target(exclude: Node) -> void:
	var best: Node3D = null
	var best_dist: float = BOUNCE_SEARCH_RADIUS
	for e in get_tree().get_nodes_in_group("enemies"):
		if e == exclude or not (e is Node3D):
			continue
		var d: float = (e.global_position - global_position).length()
		if d < best_dist:
			best = e
			best_dist = d
	if best:
		_dir = (best.global_position - global_position).normalized()
	else:
		# 没目标：随机方向继续
		var a: float = _rng.randf() * TAU
		_dir = Vector3(cos(a), 0.0, sin(a))
