extends CharacterBody3D
## chase 行为敌人：直线追击玩家，接触持续伤害。

# 骷髅步兵基础数值（旧版 ENEMY_CONFIGS.skeleton_soldier）
@export var max_hp := 15.0
@export var damage := 5.0
@export var move_speed := 3.0
@export var attack_cooldown := 1.5
@export var xp_reward := 1

@export var target_group := "player"

const GRAVITY := 18.0
const KNOCKBACK_DECAY := 8.0   # 受击击退衰减率

var hp := 0.0
var _attack_timer := 0.0
var _target: Node3D
var _knockback := Vector3.ZERO


func _ready() -> void:
	hp = max_hp
	add_to_group("enemies")


func _physics_process(delta: float) -> void:
	_attack_timer = max(0.0, _attack_timer - delta)

	if _target == null or not is_instance_valid(_target):
		_target = get_tree().get_first_node_in_group(target_group) as Node3D
	if _target == null:
		return

	# 重力（简单落地即可，M2 阶段敌人不跳）
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		velocity.y = 0.0

	var to_target := _target.global_position - global_position
	to_target.y = 0.0
	var dir := to_target.normalized()

	# 击退衰减
	_knockback = _knockback.move_toward(Vector3.ZERO, KNOCKBACK_DECAY * delta)

	velocity.x = dir.x * move_speed + _knockback.x
	velocity.z = dir.z * move_speed + _knockback.z

	move_and_slide()

	# 接触伤害：碰撞体重叠 + 冷却好了就打
	if _attack_timer <= 0.0 and to_target.length() < 1.2:
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
	queue_free()
