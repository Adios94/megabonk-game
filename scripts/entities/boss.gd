extends CharacterBody3D
## Boss。3 阶段（HP 比例分档），周期性从当前阶段的 attacks 池随机选一个执行。
## 攻击实现简化：melee_swipe（近战 AoE）、ground_slam（原地 AoE）、
## dark_bolt（前向直线弹）、charge（冲刺）、summon_wave（召唤小怪）、
## aoe_explosion（大 AoE）、dark_rain（周围随机点 AoE）。

signal boss_died(boss: Node)
signal hp_changed(hp: float, max_hp: float, phase: int)

const GRAVITY := 18.0

@export var boss_hp: float = 30000.0

var hp: float = 0.0
var phase: int = 1
var move_speed: float = 3.0
var enraged: bool = false
var _target: Node3D
var _attack_timer: float = 0.0

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

# 3 阶段配置：ratio 阈值 + attacks 池 + speed + enraged
var _phases: Array = [
	{"hp_ratio": 1.0, "phase": 1, "attacks": ["melee_swipe", "ground_slam", "dark_bolt"], "speed": 3.0, "enraged": false},
	{"hp_ratio": 0.6, "phase": 2, "attacks": ["melee_swipe", "ground_slam", "summon_wave", "charge", "dark_bolt"], "speed": 4.0, "enraged": false},
	{"hp_ratio": 0.3, "phase": 3, "attacks": ["aoe_explosion", "dark_rain", "charge", "summon_wave", "melee_swipe"], "speed": 5.0, "enraged": true},
]

# 冲刺状态
var _charge_timer: float = 0.0
var _charge_dir: Vector3 = Vector3.ZERO


func _ready() -> void:
	_rng.randomize()
	hp = boss_hp
	add_to_group("enemies")
	add_to_group("boss")
	# defer 让 UI 有机会连信号
	hp_changed.emit.call_deferred(hp, boss_hp, phase)


func _physics_process(delta: float) -> void:
	_attack_timer = maxf(0.0, _attack_timer - delta)
	_charge_timer = maxf(0.0, _charge_timer - delta)

	if _target == null or not is_instance_valid(_target):
		_target = get_tree().get_first_node_in_group("player") as Node3D
	if _target == null:
		return

	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		velocity.y = 0.0

	_update_phase()

	if _charge_timer > 0.0:
		velocity.x = _charge_dir.x * move_speed * 2.5
		velocity.z = _charge_dir.z * move_speed * 2.5
	else:
		var to_t: Vector3 = _target.global_position - global_position
		to_t.y = 0.0
		var dir: Vector3 = to_t.normalized() if to_t.length() > 0.1 else Vector3.ZERO
		velocity.x = dir.x * move_speed
		velocity.z = dir.z * move_speed

	move_and_slide()

	if _attack_timer <= 0.0:
		_do_attack()
		var base_cd: float = 1.5 if enraged else 2.5
		_attack_timer = base_cd + _rng.randf()


func _update_phase() -> void:
	var ratio: float = hp / boss_hp
	var new_phase: int = 1
	var new_speed: float = 3.0
	var new_enraged: bool = false
	# 从高到低选第一个满足的
	for p in _phases:
		var pd: Dictionary = p as Dictionary
		var thresh: float = float(pd["hp_ratio"])
		if ratio <= thresh:
			# 允许覆盖到更严格的阶段（越低阈值越激进）
			new_phase = int(pd["phase"])
			new_speed = float(pd["speed"])
			new_enraged = bool(pd["enraged"])
	if new_phase != phase:
		phase = new_phase
		move_speed = new_speed
		enraged = new_enraged
		hp_changed.emit(hp, boss_hp, phase)


func _get_current_attacks() -> Array:
	var ratio: float = hp / boss_hp
	var best: Array = (_phases[0] as Dictionary)["attacks"]
	for p in _phases:
		var pd: Dictionary = p as Dictionary
		if ratio <= float(pd["hp_ratio"]):
			best = pd["attacks"]
	return best


func _do_attack() -> void:
	var pool: Array = _get_current_attacks()
	if pool.is_empty():
		return
	var attack: String = pool[_rng.randi_range(0, pool.size() - 1)]
	match attack:
		"melee_swipe": _atk_melee_swipe()
		"ground_slam": _atk_ground_slam()
		"dark_bolt": _atk_dark_bolt()
		"charge": _atk_charge()
		"summon_wave": _atk_summon_wave()
		"aoe_explosion": _atk_aoe_explosion()
		"dark_rain": _atk_dark_rain()


func _atk_melee_swipe() -> void:
	# 3.5 范围内玩家扣血
	if _target and global_position.distance_to(_target.global_position) < 4.0:
		if _target.has_method("take_damage"):
			_target.take_damage(25.0)
	_spawn_hit_ring(global_position, 4.0, Color(0.9, 0.3, 0.3, 0.6))


func _atk_ground_slam() -> void:
	# 原地 5.0 AoE
	if _target and global_position.distance_to(_target.global_position) < 5.0:
		if _target.has_method("take_damage"):
			_target.take_damage(30.0)
	_spawn_hit_ring(global_position, 5.0, Color(0.9, 0.6, 0.15, 0.6))


func _atk_dark_bolt() -> void:
	# 直线暗影弹（用 projectile_bullet 但敌方 → 暂时简化：直接对玩家扣血 if 前方）
	if _target == null:
		return
	var to_t: Vector3 = _target.global_position - global_position
	to_t.y = 0.0
	if to_t.length() < 15.0:
		if _target.has_method("take_damage"):
			_target.take_damage(15.0)
		_spawn_beam(global_position + Vector3(0.0, 1.0, 0.0), _target.global_position + Vector3(0.0, 0.8, 0.0))


func _atk_charge() -> void:
	if _target == null:
		return
	var to_t: Vector3 = _target.global_position - global_position
	to_t.y = 0.0
	if to_t.length() < 0.1:
		return
	_charge_dir = to_t.normalized()
	_charge_timer = 1.0


func _atk_summon_wave() -> void:
	# 召唤 5 个 zombie
	var scene: PackedScene = load("res://scenes/entities/enemy_chase.tscn")
	if scene == null:
		return
	for i in 5:
		var a: float = _rng.randf() * TAU
		var r: float = 4.0
		var pos: Vector3 = global_position + Vector3(cos(a) * r, 0.0, sin(a) * r)
		pos.y = 1.0
		var e: Node3D = scene.instantiate() as Node3D
		e.enemy_type = "zombie"
		get_tree().current_scene.add_child(e)
		e.global_position = pos
		if e.has_method("configure_from_type"):
			e.configure_from_type("zombie", 1.0)


func _atk_aoe_explosion() -> void:
	if _target and global_position.distance_to(_target.global_position) < 8.0:
		if _target.has_method("take_damage"):
			_target.take_damage(40.0)
	_spawn_hit_ring(global_position, 8.0, Color(0.9, 0.15, 0.35, 0.7))


func _atk_dark_rain() -> void:
	# 5 个随机位置 AoE
	for i in 5:
		var a: float = _rng.randf() * TAU
		var r: float = _rng.randf_range(3.0, 8.0)
		var pos: Vector3 = global_position + Vector3(cos(a) * r, 0.0, sin(a) * r)
		if _target and pos.distance_to(_target.global_position) < 2.5:
			if _target.has_method("take_damage"):
				_target.take_damage(18.0)
		_spawn_hit_ring(pos, 2.5, Color(0.5, 0.2, 0.9, 0.55))


func _spawn_hit_ring(pos: Vector3, radius: float, color: Color) -> void:
	var mesh: MeshInstance3D = MeshInstance3D.new()
	var tm: TorusMesh = TorusMesh.new()
	tm.inner_radius = radius * 0.75
	tm.outer_radius = radius
	mesh.mesh = tm
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material_override = mat
	mesh.rotation_degrees.x = 90.0
	get_tree().current_scene.add_child(mesh)
	mesh.global_position = pos + Vector3(0.0, 0.15, 0.0)
	var tw: Tween = get_tree().create_tween()
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.35)
	tw.tween_callback(mesh.queue_free)


func _spawn_beam(from: Vector3, to: Vector3) -> void:
	var mesh: MeshInstance3D = MeshInstance3D.new()
	var cyl: CylinderMesh = CylinderMesh.new()
	cyl.height = from.distance_to(to)
	cyl.top_radius = 0.12
	cyl.bottom_radius = 0.12
	mesh.mesh = cyl
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Color(0.5, 0.15, 0.85, 0.85)
	mat.emission_enabled = true
	mat.emission = Color(0.5, 0.15, 0.85, 1)
	mat.emission_energy_multiplier = 2.5
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mesh.material_override = mat
	get_tree().current_scene.add_child(mesh)
	mesh.global_position = (from + to) * 0.5
	var dir: Vector3 = (to - from).normalized()
	if dir.length() > 0.001:
		var basis: Basis = Basis()
		basis.y = dir
		basis.x = dir.cross(Vector3.UP).normalized() if abs(dir.dot(Vector3.UP)) < 0.99 else Vector3.RIGHT
		basis.z = basis.x.cross(basis.y).normalized()
		mesh.global_transform.basis = basis
	var tw: Tween = get_tree().create_tween()
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.25)
	tw.tween_callback(mesh.queue_free)


func take_damage(amount: float, _source_pos: Vector3 = Vector3.ZERO) -> void:
	hp -= amount
	hp_changed.emit(hp, boss_hp, phase)
	if hp <= 0.0:
		_die()


func _die() -> void:
	boss_died.emit(self)
	EventBus.enemy_died.emit(self, null)
	# 掉 100 XP + 大量银币
	var scene: PackedScene = load("res://scenes/entities/xp_pickup.tscn")
	if scene:
		var p: Node3D = scene.instantiate() as Node3D
		get_tree().current_scene.add_child(p)
		p.global_position = global_position + Vector3(0.0, 0.8, 0.0)
		if p.has_method("setup"):
			p.setup(100)
	# 通知 GameManager 胜利
	GameManager.end_run({"cause": "victory"})
	queue_free()
