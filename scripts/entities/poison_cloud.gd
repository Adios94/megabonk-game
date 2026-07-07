extends Node3D
## 毒气云。每 tick_interval 对范围内所有敌人扣 dps * tick_interval 伤害。

var _radius: float = 3.0
var _dps: float = 6.0
var _player: Node
var _lifetime: float = 4.0
var _tick_timer: float = 0.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

const TICK_INTERVAL := 0.5


func _ready() -> void:
	_rng.randomize()


func setup(radius: float, dps: float, player: Node) -> void:
	_radius = radius
	_dps = dps
	_player = player
	_build_visual()


func _process(delta: float) -> void:
	_lifetime -= delta
	if _lifetime <= 0.0:
		queue_free()
		return
	_tick_timer -= delta
	if _tick_timer <= 0.0:
		_tick_timer = TICK_INTERVAL
		_tick()


func _tick() -> void:
	var damage: float = _dps * TICK_INTERVAL
	for e in WeaponUtil.find_enemies_in_radius(global_position, _radius, get_tree()):
		WeaponUtil.deal_damage(e as Node, damage, _player, _rng, global_position)


func _build_visual() -> void:
	var mesh: MeshInstance3D = MeshInstance3D.new()
	var sph: SphereMesh = SphereMesh.new()
	sph.radius = _radius
	sph.height = _radius * 2.0
	sph.radial_segments = 12
	sph.rings = 6
	mesh.mesh = sph
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Color(0.4, 0.7, 0.3, 0.35)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true
	mat.emission = Color(0.4, 0.7, 0.3, 1)
	mat.emission_energy_multiplier = 0.6
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material_override = mat
	add_child(mesh)
