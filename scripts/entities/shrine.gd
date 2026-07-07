extends Node3D
## 充能神殿。玩家进入 SHRINE_RADIUS 累计 charge，充满 SHRINE_CHARGE_DURATION 秒后进入 ready 状态，
## 弹出 4 选 1 面板；玩家选定后 apply 到 player.shrine_bonuses，圣殿变灰。

signal ready_for_reward(shrine: Node)

const RADIUS := 2.5
const CHARGE_DURATION := 4.0
const DECAY_RATE := 0.5

var phase: String = "charging"   # charging / ready / consumed
var charge_timer: float = 0.0

var _player: Node3D
var _visual: MeshInstance3D
var _mat: StandardMaterial3D


func _ready() -> void:
	_build_visual()


func _process(delta: float) -> void:
	if phase == "consumed":
		return
	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player") as Node3D
	if _player == null:
		return

	if phase == "charging":
		var dist: float = global_position.distance_to(_player.global_position)
		if dist < RADIUS:
			charge_timer += delta
		else:
			charge_timer = maxf(0.0, charge_timer - delta * DECAY_RATE)
		if charge_timer >= CHARGE_DURATION:
			phase = "ready"
			charge_timer = CHARGE_DURATION
			ready_for_reward.emit(self)
			_update_visual_ready()
			return
		_update_visual_charging()


func mark_consumed() -> void:
	phase = "consumed"
	if _mat:
		_mat.albedo_color = Color(0.3, 0.3, 0.35, 0.6)
		_mat.emission_energy_multiplier = 0.1


func _build_visual() -> void:
	_visual = MeshInstance3D.new()
	var cyl: CylinderMesh = CylinderMesh.new()
	cyl.top_radius = 0.6
	cyl.bottom_radius = 0.8
	cyl.height = 2.0
	_visual.mesh = cyl
	_visual.position = Vector3(0.0, 1.0, 0.0)
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = Color(0.4, 0.5, 0.9, 0.85)
	_mat.emission_enabled = true
	_mat.emission = Color(0.4, 0.5, 0.9, 1)
	_mat.emission_energy_multiplier = 0.8
	_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_visual.material_override = _mat
	add_child(_visual)


func _update_visual_charging() -> void:
	if _mat == null:
		return
	var pct: float = charge_timer / CHARGE_DURATION
	_mat.emission_energy_multiplier = 0.5 + pct * 2.0


func _update_visual_ready() -> void:
	if _mat == null:
		return
	_mat.albedo_color = Color(0.9, 0.7, 0.2, 0.9)
	_mat.emission = Color(1.0, 0.8, 0.2, 1)
	_mat.emission_energy_multiplier = 4.0
