extends CharacterBody3D
## chase 行为敌人：直线追击玩家，接触持续伤害。
## 通过 configure_from_type 从 Enemies 数据表加载 6 种敌人的数值。

@export var enemy_type: String = "skeleton_soldier"

# 运行时数值，从 Enemies 数据加载
var max_hp := 15.0
var damage := 5.0
var move_speed := 3.0
var attack_cooldown := 1.5
var xp_reward := 1
var preferred_range := 0.0   # ranged 敌人保持距离；0 = chase 到脸
var elite_multiplier := 1.0   # 精英加成（外部注入前先调）

@export var target_group := "player"

const GRAVITY := 18.0
const KNOCKBACK_DECAY := 8.0

var hp := 0.0
var _attack_timer := 0.0
var _target: Node3D
var _knockback := Vector3.ZERO


func _ready() -> void:
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
	elite_multiplier = elite_mult
	hp = max_hp


func _physics_process(delta: float) -> void:
	_attack_timer = max(0.0, _attack_timer - delta)

	if _target == null or not is_instance_valid(_target):
		_target = get_tree().get_first_node_in_group(target_group) as Node3D
	if _target == null:
		return

	# 重力
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		velocity.y = 0.0

	var to_target := _target.global_position - global_position
	to_target.y = 0.0
	var dist := to_target.length()
	var dir := to_target.normalized() if dist > 0.01 else Vector3.ZERO

	# ranged 敌人：保持 preferred_range 距离
	if preferred_range > 0.0 and dist < preferred_range - 0.5:
		dir = -dir   # 后退
	elif preferred_range > 0.0 and dist < preferred_range + 0.5:
		dir = Vector3.ZERO   # 保持

	_knockback = _knockback.move_toward(Vector3.ZERO, KNOCKBACK_DECAY * delta)

	velocity.x = dir.x * move_speed + _knockback.x
	velocity.z = dir.z * move_speed + _knockback.z

	move_and_slide()

	# 攻击判定
	var attack_dist: float = preferred_range + 1.0 if preferred_range > 0.0 else 1.2
	if _attack_timer <= 0.0 and dist < attack_dist:
		if _target.has_method("take_damage"):
			_target.take_damage(damage)
			_attack_timer = attack_cooldown


func take_damage(amount: float, source_pos: Vector3 = Vector3.ZERO) -> void:
	hp -= amount
	if source_pos != Vector3.ZERO:
		var push := (global_position - source_pos)
		push.y = 0.0
		_knockback = push.normalized() * 4.0
	if hp <= 0.0:
		_die()


func _die() -> void:
	EventBus.enemy_died.emit(self, null)
	_spawn_xp_pickup()
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
