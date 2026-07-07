extends Node3D
## XP 拾取物。敌人死亡生成，玩家 pickup_radius 内自动吸引，接触后加 XP。

@export var value: int = 1
@export var color_tier: int = 0   # 0=green 1=blue 2=purple 3=orange

const COLORS := [
	Color(0.35, 1.0, 0.35),
	Color(0.35, 0.55, 1.0),
	Color(0.85, 0.35, 1.0),
	Color(1.0, 0.7, 0.15),
]

var _player: Node3D
var _velocity := Vector3.ZERO
var _lifetime := 30.0


func _ready() -> void:
	_apply_color()
	# 略微弹跳
	_velocity = Vector3(randf_range(-1.5, 1.5), randf_range(3.0, 5.0), randf_range(-1.5, 1.5))


func _process(delta: float) -> void:
	_lifetime -= delta
	if _lifetime <= 0.0:
		queue_free()
		return

	# 找玩家
	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player") as Node3D
	if _player == null:
		# 空自由落体
		_velocity.y -= 18.0 * delta
		global_position += _velocity * delta
		if global_position.y < 0.3:
			global_position.y = 0.3
			_velocity = Vector3.ZERO
		return

	var dist: float = global_position.distance_to(_player.global_position)
	var attract_radius: float = 2.0
	if _player.get("pickup_radius") != null:
		attract_radius = float(_player.pickup_radius)
	if dist < attract_radius:
		var dir: Vector3 = (_player.global_position + Vector3(0.0, 0.8, 0.0) - global_position).normalized()
		global_position += dir * 12.0 * delta
		_velocity = Vector3.ZERO
		if dist < 0.8:
			_collect()
	else:
		# 自由落体到地面
		_velocity.y -= 18.0 * delta
		global_position += _velocity * delta
		if global_position.y < 0.3:
			global_position.y = 0.3
			_velocity.x = 0.0
			_velocity.z = 0.0
			_velocity.y = 0.0


func setup(v: int) -> void:
	value = v
	if v >= 100:
		color_tier = 3
	elif v >= 25:
		color_tier = 2
	elif v >= 5:
		color_tier = 1
	else:
		color_tier = 0


func _apply_color() -> void:
	var mesh := $MeshInstance3D as MeshInstance3D
	if mesh == null:
		return
	var mat := StandardMaterial3D.new()
	mat.albedo_color = COLORS[color_tier]
	mat.emission_enabled = true
	mat.emission = COLORS[color_tier]
	mat.emission_energy_multiplier = 1.5
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material_override = mat


func _collect() -> void:
	if _player and is_instance_valid(_player) and _player.has_method("gain_xp"):
		_player.gain_xp(value)
	queue_free()
