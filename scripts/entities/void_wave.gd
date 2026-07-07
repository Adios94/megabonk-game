extends Node3D
## 虚空涟漪波。半径 0 → max_radius，扫过时对该半径处的敌人一次性扣血。
## 每帧记录当前波前半径 r，命中 (r - band, r) 内的敌人。

var _max_radius: float = 4.0
var _expand_speed: float = 8.0
var _damage: float = 12.0
var _player: Node

var _cur_radius: float = 0.0
var _hit_ids: Dictionary = {}
var _visual: MeshInstance3D
var _mat: StandardMaterial3D
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

const BAND := 0.6


func _ready() -> void:
	_rng.randomize()
	_build_visual()


func setup(max_radius: float, expand_speed: float, damage: float, player: Node) -> void:
	_max_radius = max_radius
	_expand_speed = expand_speed
	_damage = damage
	_player = player


func _process(delta: float) -> void:
	var prev: float = _cur_radius
	_cur_radius += _expand_speed * delta
	if _cur_radius > _max_radius:
		queue_free()
		return

	# 视觉更新
	if _visual and _visual.mesh is TorusMesh:
		var tm: TorusMesh = _visual.mesh as TorusMesh
		tm.inner_radius = maxf(0.0, _cur_radius - BAND)
		tm.outer_radius = _cur_radius
	if _mat:
		var alpha: float = 1.0 - _cur_radius / _max_radius
		_mat.albedo_color.a = alpha * 0.65
		_mat.emission_energy_multiplier = 2.0 * alpha

	# 命中：环带内新敌人
	for e in get_tree().get_nodes_in_group("enemies"):
		if not (e is Node3D):
			continue
		var eid: int = e.get_instance_id()
		if _hit_ids.has(eid):
			continue
		var d: float = (e.global_position - global_position).length()
		if d >= prev and d < _cur_radius:
			_hit_ids[eid] = true
			WeaponUtil.deal_damage(e as Node, _damage, _player, _rng, global_position)


func _build_visual() -> void:
	_visual = MeshInstance3D.new()
	var tm: TorusMesh = TorusMesh.new()
	tm.inner_radius = 0.0
	tm.outer_radius = 0.1
	_visual.mesh = tm
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = Color(0.55, 0.3, 0.9, 0.65)
	_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_mat.emission_enabled = true
	_mat.emission = Color(0.55, 0.3, 0.9, 1)
	_mat.emission_energy_multiplier = 2.0
	_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_visual.material_override = _mat
	_visual.rotation_degrees.x = 90.0
	add_child(_visual)
