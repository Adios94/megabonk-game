extends CharacterBody3D
## 玩家控制器。移动 / 跳 / 滑铲 / 兔子跳，数值沿用旧版 config.ts。

# 移动常量（对应旧版 config.ts:21-27，megachad 起手数值）
const BASE_SPEED := 4.0
const JUMP_FORCE := 6.0
const GRAVITY := 18.0
const SLIDE_SPEED_MULTIPLIER := 1.6
const SLIDE_DURATION := 0.5
const SLIDE_COOLDOWN := 0.3
const BUNNY_HOP_WINDOW := 0.15
const BUNNY_HOP_BONUS := 1.2

var _slide_timer := 0.0
var _slide_cooldown := 0.0
var _land_timer := INF   # 距上次落地经过的秒数；用来判定 bunny hop 窗口
var _was_on_floor := true


func _physics_process(delta: float) -> void:
	_update_timers(delta)

	# 重力（自定义，不用项目默认 9.8）
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	elif _was_on_floor == false:
		_land_timer = 0.0   # 刚落地，开 bunny hop 窗口

	# 水平输入（世界轴，相机是固定角度所以直接映射）
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := Vector3(input_dir.x, 0.0, input_dir.y)

	var speed := BASE_SPEED
	if _slide_timer > 0.0:
		speed *= SLIDE_SPEED_MULTIPLIER

	if direction != Vector3.ZERO:
		velocity.x = direction.x * speed
		velocity.z = direction.z * speed
		# 面向移动方向（原地不转）
		var target_yaw := atan2(direction.x, direction.z)
		rotation.y = lerp_angle(rotation.y, target_yaw, min(1.0, delta * 12.0))
	else:
		velocity.x = move_toward(velocity.x, 0.0, speed * delta * 8.0)
		velocity.z = move_toward(velocity.z, 0.0, speed * delta * 8.0)

	# 跳跃 / 兔子跳
	if Input.is_action_just_pressed("jump") and is_on_floor():
		var jump_v := JUMP_FORCE
		if _land_timer <= BUNNY_HOP_WINDOW:
			jump_v *= BUNNY_HOP_BONUS
		velocity.y = jump_v

	# 滑铲：地面 + 有输入 + 冷却好了
	if Input.is_action_just_pressed("slide") \
			and is_on_floor() \
			and _slide_cooldown <= 0.0 \
			and direction != Vector3.ZERO:
		_slide_timer = SLIDE_DURATION
		_slide_cooldown = SLIDE_DURATION + SLIDE_COOLDOWN

	_was_on_floor = is_on_floor()
	move_and_slide()


func _update_timers(delta: float) -> void:
	_slide_timer = max(0.0, _slide_timer - delta)
	_slide_cooldown = max(0.0, _slide_cooldown - delta)
	if is_on_floor():
		_land_timer += delta
	else:
		_land_timer = INF   # 空中就断掉窗口
