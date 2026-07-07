extends CharacterBody3D
## 通用敌人节点。行为按 Enemies.get_def(enemy_type).behavior 分派：
##   chase   — 直线追击（默认）
##   ranged  — 保持 preferred_range 距离
##   charge  — 蓄力冲刺（周期性高速冲向玩家）
##   dive    — 空中盘旋 + 俯冲

@export var enemy_type: String = "skeleton_soldier"

var max_hp: float = 15.0
var damage: float = 5.0
var move_speed: float = 3.0
var attack_cooldown: float = 1.5
var xp_reward: int = 1
var preferred_range: float = 0.0
var behavior: String = "chase"
var elite_multiplier: float = 1.0

@export var target_group := "player"

const GRAVITY := 18.0
const KNOCKBACK_DECAY := 8.0

# charge 用
const CHARGE_TELEGRAPH := 0.6      # 蓄力时间
const CHARGE_INTERVAL_MIN := 3.0
const CHARGE_INTERVAL_MAX := 5.0
const CHARGE_DURATION := 0.7
const CHARGE_SPEED_MULT := 3.5

# dive 用
const DIVE_HEIGHT := 4.0
const DIVE_INTERVAL_MIN := 2.5
const DIVE_INTERVAL_MAX := 4.0
const DIVE_DURATION := 0.8

var hp: float = 0.0
var _attack_timer: float = 0.0
var _target: Node3D
var _knockback: Vector3 = Vector3.ZERO

# charge 状态机
var _charge_state: String = "cooldown"   # cooldown / telegraph / charging
var _charge_timer: float = 0.0
var _charge_dir: Vector3 = Vector3.ZERO

# dive 状态
var _dive_state: String = "hover"        # hover / dive / recover
var _dive_timer: float = 0.0

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	if enemy_type != "":
		configure_from_type(enemy_type)
	add_to_group("enemies")


func configure_from_type(t: String, elite_mult: float = 1.0) -> void:
	enemy_type = t
	var def: Dictionary = Enemies.get_def(t)
	if def.is_empty():
		return
	max_hp = float(def["hp"]) * elite_mult
	damage = float(def["damage"]) * elite_mult
	move_speed = float(def["speed"])
	attack_cooldown = float(def["attack_cooldown"])
	xp_reward = int(def["xp_reward"])
	preferred_range = float(def.get("preferred_range", 0.0))
	behavior = str(def.get("behavior", "chase"))
	elite_multiplier = elite_mult
	hp = max_hp

	# 初始化 charge / dive 状态
	if behavior == "charge":
		_charge_state = "cooldown"
		_charge_timer = _rng.randf_range(CHARGE_INTERVAL_MIN, CHARGE_INTERVAL_MAX)
	elif behavior == "dive":
		_dive_state = "hover"
		_dive_timer = _rng.randf_range(DIVE_INTERVAL_MIN, DIVE_INTERVAL_MAX)


func _physics_process(delta: float) -> void:
	_attack_timer = maxf(0.0, _attack_timer - delta)

	if _target == null or not is_instance_valid(_target):
		_target = get_tree().get_first_node_in_group(target_group) as Node3D
	if _target == null:
		return

	# Final Swarm boost（480~540s 移速 x1.3）
	var effective_speed: float = move_speed
	if GameManager.run_seconds >= GameConfig.FINAL_SWARM_START_TIME:
		effective_speed *= GameConfig.FINAL_SWARM_SPEED_MULTIPLIER
	# 保存原速度，恢复用
	var orig_speed: float = move_speed
	move_speed = effective_speed

	# dive 敌人自己管 y；其他敌人常规重力
	if behavior != "dive":
		if not is_on_floor():
			velocity.y -= GRAVITY * delta
		else:
			velocity.y = 0.0

	_knockback = _knockback.move_toward(Vector3.ZERO, KNOCKBACK_DECAY * delta)

	match behavior:
		"chase":
			_ai_chase(delta)
		"ranged":
			_ai_ranged(delta)
		"charge":
			_ai_charge(delta)
		"dive":
			_ai_dive(delta)
		_:
			_ai_chase(delta)

	move_and_slide()
	_try_attack()

	move_speed = orig_speed


func _ai_chase(_delta: float) -> void:
	var to_t: Vector3 = _target.global_position - global_position
	to_t.y = 0.0
	var dir: Vector3 = to_t.normalized() if to_t.length() > 0.01 else Vector3.ZERO
	velocity.x = dir.x * move_speed + _knockback.x
	velocity.z = dir.z * move_speed + _knockback.z


func _ai_ranged(_delta: float) -> void:
	var to_t: Vector3 = _target.global_position - global_position
	to_t.y = 0.0
	var dist: float = to_t.length()
	var dir: Vector3 = to_t.normalized() if dist > 0.01 else Vector3.ZERO
	# 保持 preferred_range
	if preferred_range > 0.0:
		if dist < preferred_range - 0.5:
			dir = -dir
		elif dist < preferred_range + 0.5:
			dir = Vector3.ZERO
	velocity.x = dir.x * move_speed + _knockback.x
	velocity.z = dir.z * move_speed + _knockback.z


func _ai_charge(delta: float) -> void:
	_charge_timer -= delta
	var to_t: Vector3 = _target.global_position - global_position
	to_t.y = 0.0
	var dir: Vector3 = to_t.normalized() if to_t.length() > 0.01 else Vector3.ZERO

	match _charge_state:
		"cooldown":
			# 慢速接近
			velocity.x = dir.x * move_speed * 0.7 + _knockback.x
			velocity.z = dir.z * move_speed * 0.7 + _knockback.z
			if _charge_timer <= 0.0 and to_t.length() < 12.0:
				_charge_state = "telegraph"
				_charge_timer = CHARGE_TELEGRAPH
				_charge_dir = dir   # 锁定方向
		"telegraph":
			velocity.x = 0.0
			velocity.z = 0.0
			if _charge_timer <= 0.0:
				_charge_state = "charging"
				_charge_timer = CHARGE_DURATION
		"charging":
			velocity.x = _charge_dir.x * move_speed * CHARGE_SPEED_MULT + _knockback.x
			velocity.z = _charge_dir.z * move_speed * CHARGE_SPEED_MULT + _knockback.z
			if _charge_timer <= 0.0:
				_charge_state = "cooldown"
				_charge_timer = _rng.randf_range(CHARGE_INTERVAL_MIN, CHARGE_INTERVAL_MAX)


func _ai_dive(delta: float) -> void:
	_dive_timer -= delta
	var to_t: Vector3 = _target.global_position - global_position
	to_t.y = 0.0
	var dir: Vector3 = to_t.normalized() if to_t.length() > 0.01 else Vector3.ZERO

	match _dive_state:
		"hover":
			# 在目标上空盘旋
			velocity.x = dir.x * move_speed * 0.6 + _knockback.x
			velocity.z = dir.z * move_speed * 0.6 + _knockback.z
			# 保持 DIVE_HEIGHT 高度
			velocity.y = (DIVE_HEIGHT - global_position.y) * 3.0
			if _dive_timer <= 0.0 and to_t.length() < 6.0:
				_dive_state = "dive"
				_dive_timer = DIVE_DURATION
		"dive":
			# 快速俯冲到玩家
			var goal: Vector3 = _target.global_position + Vector3(0.0, 0.5, 0.0)
			var to_goal: Vector3 = goal - global_position
			velocity = to_goal.normalized() * move_speed * 2.5 + Vector3(_knockback.x, 0.0, _knockback.z)
			if _dive_timer <= 0.0 or to_goal.length() < 1.0:
				_dive_state = "recover"
				_dive_timer = 0.5
		"recover":
			velocity.x = 0.0
			velocity.z = 0.0
			velocity.y = (DIVE_HEIGHT - global_position.y) * 4.0
			if _dive_timer <= 0.0:
				_dive_state = "hover"
				_dive_timer = _rng.randf_range(DIVE_INTERVAL_MIN, DIVE_INTERVAL_MAX)


func _try_attack() -> void:
	if _target == null:
		return
	var dist: float = (_target.global_position - global_position).length()
	var attack_dist: float = 1.2
	if preferred_range > 0.0:
		attack_dist = preferred_range + 1.0
	if _attack_timer <= 0.0 and dist < attack_dist:
		if _target.has_method("take_damage"):
			_target.take_damage(damage)
			_attack_timer = attack_cooldown


func take_damage(amount: float, source_pos: Vector3 = Vector3.ZERO) -> void:
	hp -= amount
	if source_pos != Vector3.ZERO:
		var push: Vector3 = (global_position - source_pos)
		push.y = 0.0
		_knockback = push.normalized() * 4.0
	if hp <= 0.0:
		_die()


func _die() -> void:
	EventBus.enemy_died.emit(self, null)
	_spawn_xp_pickup()
	_maybe_drop_health()
	queue_free()


func _spawn_xp_pickup() -> void:
	var scene: PackedScene = load("res://scenes/entities/xp_pickup.tscn")
	if scene == null:
		return
	var p: Node3D = scene.instantiate() as Node3D
	get_tree().current_scene.add_child(p)
	p.global_position = global_position + Vector3(0.0, 0.5, 0.0)
	if p.has_method("setup"):
		p.setup(xp_reward)


func _maybe_drop_health() -> void:
	var roll: float = _rng.randf()
	if roll < GameConfig.HEALTH_DROP_CHANCE:
		_drop_health(50.0)
	elif roll < GameConfig.HEALTH_DROP_CHANCE + GameConfig.HEALTH_SMALL_DROP_CHANCE:
		_drop_health(25.0)


func _drop_health(amount: float) -> void:
	var scene: PackedScene = load("res://scenes/entities/health_pickup.tscn")
	if scene == null:
		return
	var p: Node3D = scene.instantiate() as Node3D
	get_tree().current_scene.add_child(p)
	p.global_position = global_position + Vector3(0.0, 0.5, 0.0)
	if p.has_method("setup"):
		p.setup(amount)
