extends Node3D
## Altar 飞碟。玩家进入 ALTAR_INTERACT_RADIUS 内按住 E 键累积充能，
## 累积到 ALTAR_SUMMON_DURATION 秒后触发 Boss spawn。

signal boss_summoned(pos: Vector3)

const RADIUS := 2.0
const SUMMON_DURATION := 2.0
const DECAY_RATE := 0.5

var _player: Node3D
var _timer: float = 0.0
var _summoned: bool = false
var _visual: MeshInstance3D
var _mat: StandardMaterial3D
var _ring: MeshInstance3D
var _ring_mat: StandardMaterial3D


func _ready() -> void:
	_build_visual()


func _process(delta: float) -> void:
	if _summoned:
		# 缓慢下沉 + 淡出
		global_position.y = maxf(0.5, global_position.y - delta * 0.4)
		if _mat:
			_mat.albedo_color.a = maxf(0.0, _mat.albedo_color.a - delta * 0.3)
		return

	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player") as Node3D
	if _player == null:
		return
	var dist: float = global_position.distance_to(_player.global_position)
	var in_range: bool = dist <= RADIUS
	if in_range and Input.is_action_pressed("interact"):
		_timer += delta
		if _timer >= SUMMON_DURATION:
			_summon()
	else:
		_timer = maxf(0.0, _timer - delta * DECAY_RATE)

	if _ring_mat:
		var pct: float = _timer / SUMMON_DURATION
		_ring_mat.emission_energy_multiplier = 0.5 + pct * 4.0
		var ring: TorusMesh = _ring.mesh as TorusMesh
		ring.inner_radius = RADIUS * (0.7 + pct * 0.3)
		ring.outer_radius = RADIUS * (0.85 + pct * 0.4)

	# 飞碟旋转
	if _visual:
		_visual.rotation.y += delta * 1.5


func _summon() -> void:
	_summoned = true
	boss_summoned.emit(global_position + Vector3(0, 0.5, 0))
	Audio.play_sfx("boss_loading")


func _build_visual() -> void:
	# 飞碟：扁平圆盘
	_visual = MeshInstance3D.new()
	var disc: CylinderMesh = CylinderMesh.new()
	disc.top_radius = 1.4
	disc.bottom_radius = 1.8
	disc.height = 0.4
	_visual.mesh = disc
	_visual.position = Vector3(0.0, 1.5, 0.0)
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = Color(0.55, 0.55, 0.65, 0.95)
	_mat.emission_enabled = true
	_mat.emission = Color(0.5, 0.7, 1.0, 1)
	_mat.emission_energy_multiplier = 0.4
	_mat.metallic = 0.85
	_mat.roughness = 0.2
	_visual.material_override = _mat
	add_child(_visual)

	# 地面充能圈
	_ring = MeshInstance3D.new()
	var tm: TorusMesh = TorusMesh.new()
	tm.inner_radius = RADIUS * 0.7
	tm.outer_radius = RADIUS * 0.85
	_ring.mesh = tm
	_ring.position = Vector3(0.0, 0.1, 0.0)
	_ring.rotation_degrees.x = 90.0
	_ring_mat = StandardMaterial3D.new()
	_ring_mat.albedo_color = Color(0.3, 0.6, 1.0, 0.6)
	_ring_mat.emission_enabled = true
	_ring_mat.emission = Color(0.4, 0.7, 1.0, 1)
	_ring_mat.emission_energy_multiplier = 0.8
	_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring.material_override = _ring_mat
	add_child(_ring)
