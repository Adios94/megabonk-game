extends Node3D
## 宝箱。玩家进入 interact_radius 显示提示，按 E 键开。开后掉 50~200 银币 pickup。

const INTERACT_RADIUS := 2.5
const SILVER_MIN := 50
const SILVER_MAX := 200

var _opened: bool = false
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _player: Node3D

@onready var _prompt: Node3D = $Prompt


func _ready() -> void:
	_rng.randomize()
	if _prompt:
		_prompt.visible = false


func _process(_delta: float) -> void:
	if _opened:
		return
	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player") as Node3D
	if _player == null:
		return

	var dist: float = global_position.distance_to(_player.global_position)
	var in_range: bool = dist <= INTERACT_RADIUS
	if _prompt:
		_prompt.visible = in_range

	if in_range and Input.is_action_just_pressed("interact"):
		_open()


func _open() -> void:
	_opened = true
	Audio.play_sfx("pickup_openchest")
	var amount: int = _rng.randi_range(SILVER_MIN, SILVER_MAX)
	# 掉几个银币 pickup 而不是直接加数值，视觉更好
	var count: int = 6 + int(amount / 40)
	var per: int = int(round(float(amount) / count))
	var scene: PackedScene = preload("res://scenes/entities/silver_pickup.tscn")
	for i in count:
		var a: float = _rng.randf() * TAU
		var r: float = _rng.randf_range(0.5, 1.5)
		var p: Node3D = scene.instantiate() as Node3D
		get_tree().current_scene.add_child(p)
		p.global_position = global_position + Vector3(cos(a) * r, 0.5, sin(a) * r)
		if p.has_method("setup"):
			p.setup(per)
	# 视觉：变暗
	for child in get_children():
		if child is MeshInstance3D:
			var mi: MeshInstance3D = child
			var mat: StandardMaterial3D = StandardMaterial3D.new()
			mat.albedo_color = Color(0.35, 0.3, 0.25)
			mi.material_override = mat
	if _prompt:
		_prompt.visible = false
