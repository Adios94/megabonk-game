extends Node3D
## 灼地痕迹。每 tick_interval 对范围内敌人扣一次 damage。

var _radius: float = 1.0
var _damage: float = 5.0
var _player: Node
var _lifetime: float = 2.5
var _tick_timer: float = 0.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

const TICK_INTERVAL := 0.4


func _ready() -> void:
	_rng.randomize()


func setup(radius: float, damage: float, player: Node) -> void:
	_radius = radius
	_damage = damage
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
		for e in WeaponUtil.find_enemies_in_radius(global_position, _radius, get_tree()):
			WeaponUtil.deal_damage(e as Node, _damage, _player, _rng, global_position)


func _build_visual() -> void:
	var mesh: MeshInstance3D = MeshInstance3D.new()
	var cyl: CylinderMesh = CylinderMesh.new()
	cyl.height = 0.05
	cyl.top_radius = _radius
	cyl.bottom_radius = _radius
	mesh.mesh = cyl
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.4, 0.15, 0.55)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.4, 0.15, 1)
	mat.emission_energy_multiplier = 1.2
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material_override = mat
	add_child(mesh)
