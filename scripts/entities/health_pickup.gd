extends Node3D
## HP 拾取（心）。玩家接触后回血 amount。

var value: float = 25.0
var _player: Node3D
var _lifetime: float = 30.0


func _ready() -> void:
	_apply_color()


func setup(amount: float) -> void:
	value = amount


func _process(delta: float) -> void:
	_lifetime -= delta
	if _lifetime <= 0.0:
		queue_free()
		return

	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player") as Node3D
	if _player == null:
		return

	var to_p: Vector3 = _player.global_position - global_position
	var dist: float = to_p.length()
	var attract_r: float = float(_player.pickup_radius) if _player.get("pickup_radius") != null else 2.0
	if dist < attract_r:
		var dir: Vector3 = (_player.global_position + Vector3(0.0, 0.8, 0.0) - global_position).normalized()
		global_position += dir * 12.0 * delta
	if dist < 0.9:
		_collect()


func _apply_color() -> void:
	var mesh: MeshInstance3D = $MeshInstance3D as MeshInstance3D
	if mesh == null:
		return
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	# 大心红，小心粉
	var c: Color = Color(1.0, 0.35, 0.4) if value >= 40.0 else Color(1.0, 0.55, 0.65)
	mat.albedo_color = c
	mat.emission_enabled = true
	mat.emission = c
	mat.emission_energy_multiplier = 1.2
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material_override = mat


func _collect() -> void:
	if _player and is_instance_valid(_player) and _player.has_method("heal"):
		_player.heal(value)
	Audio.play_sfx("pickup_eat")
	queue_free()
