extends CharacterBody3D
## 玩家控制器。移动 / 战斗 / 成长。数值沿用旧版 config.ts + data/*。

signal hp_changed(hp: float, max_hp: float)
signal xp_changed(xp: int, xp_to_next: int, level: int)
signal died
signal leveled_up(new_level: int)
signal kill_count_changed(count: int)

# 移动常量
const BASE_SPEED := 4.0
const JUMP_FORCE := 6.0
const GRAVITY := 18.0
const SLIDE_SPEED_MULTIPLIER := 1.6
const SLIDE_DURATION := 0.5
const SLIDE_COOLDOWN := 0.3
const BUNNY_HOP_WINDOW := 0.15
const BUNNY_HOP_BONUS := 1.2

# --- 状态 ---
var hp := 100.0
var max_hp := 100.0
var move_speed := 4.0
var damage_mult := 1.2                # 角色基础伤害倍率
var armor := 0.0
var crit_chance := 0.08
var crit_damage := 1.5
var pickup_radius := 2.0
var attack_speed_mult := 1.0

var level := 1
var xp := 0
var xp_to_next := GameConfig.xp_for_level(1)
var kill_count := 0

var combo_count := 0
var _combo_timer := 0.0
const COMBO_WINDOW := 2.0

# 武器 / 典籍 —— Array[Dictionary]，{ "type": String, "level": int }
var weapons: Array = []
var tomes: Array = []
var max_weapon_slots: int = 5   # 局内上限，随等级解锁到 5；局外任务后 6

var _is_dead := false
var _slide_timer := 0.0
var _slide_cooldown := 0.0
var _land_timer := INF
var _was_on_floor := true
var _invincible_timer := 0.0


func _ready() -> void:
	add_to_group("player")
	# defer 一帧发信号，等 HUD 连上
	hp_changed.emit.call_deferred(hp, max_hp)
	xp_changed.emit.call_deferred(xp, xp_to_next, level)
	kill_count_changed.emit.call_deferred(kill_count)
	# 起手武器：sword lv1
	add_weapon("sword", 1)
	# EventBus 敌人死亡 → 计数（先断开旧连接，避免重开场景重复 connect）
	if EventBus.enemy_died.is_connected(_on_enemy_died):
		EventBus.enemy_died.disconnect(_on_enemy_died)
	EventBus.enemy_died.connect(_on_enemy_died)


func get_max_hp() -> float:
	return max_hp


func _physics_process(delta: float) -> void:
	if _is_dead:
		return
	_update_timers(delta)

	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	elif _was_on_floor == false:
		_land_timer = 0.0

	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := Vector3(input_dir.x, 0.0, input_dir.y)

	var speed := move_speed
	if _slide_timer > 0.0:
		speed *= SLIDE_SPEED_MULTIPLIER

	if direction != Vector3.ZERO:
		velocity.x = direction.x * speed
		velocity.z = direction.z * speed
		var target_yaw := atan2(direction.x, direction.z)
		rotation.y = lerp_angle(rotation.y, target_yaw, min(1.0, delta * 12.0))
	else:
		velocity.x = move_toward(velocity.x, 0.0, speed * delta * 8.0)
		velocity.z = move_toward(velocity.z, 0.0, speed * delta * 8.0)

	if Input.is_action_just_pressed("jump") and is_on_floor():
		var jump_v := JUMP_FORCE
		if _land_timer <= BUNNY_HOP_WINDOW:
			jump_v *= BUNNY_HOP_BONUS
		velocity.y = jump_v

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
	_invincible_timer = max(0.0, _invincible_timer - delta)
	if is_on_floor():
		_land_timer += delta
	else:
		_land_timer = INF

	if _combo_timer > 0.0:
		_combo_timer -= delta
		if _combo_timer <= 0.0:
			combo_count = 0


func take_damage(amount: float) -> void:
	if _is_dead or _invincible_timer > 0.0:
		return
	var final_dmg: float = max(1.0, amount - armor)
	hp = max(0.0, hp - final_dmg)
	_invincible_timer = GameConfig.PLAYER_INVINCIBLE_DURATION
	hp_changed.emit(hp, max_hp)
	if hp <= 0.0:
		_die()


func _die() -> void:
	_is_dead = true
	velocity = Vector3.ZERO
	died.emit()
	GameManager.end_run({"cause": "death"})


func heal(amount: float) -> void:
	if _is_dead:
		return
	hp = min(max_hp, hp + amount)
	hp_changed.emit(hp, max_hp)


# --- 战斗成长 ---

func gain_xp(amount: int) -> void:
	if _is_dead:
		return
	# 连击倍率：击杀累加，2 秒内无杀归零
	var bonus: float = 1.0 + minf(combo_count * 0.05, 1.0)
	var final_xp: int = int(round(amount * bonus))
	xp += final_xp
	while xp >= xp_to_next and level < GameConfig.MAX_LEVEL:
		xp -= xp_to_next
		level += 1
		xp_to_next = GameConfig.xp_for_level(level)
		max_weapon_slots = GameConfig.compute_weapon_slots(level, 5)
		leveled_up.emit(level)
	xp_changed.emit(xp, xp_to_next, level)


func _on_enemy_died(_enemy, _killer) -> void:
	kill_count += 1
	combo_count += 1
	_combo_timer = COMBO_WINDOW
	kill_count_changed.emit(kill_count)


# --- 武器 / 典籍 ---

func add_weapon(weapon_type: String, start_level: int = 1) -> void:
	for w in weapons:
		if (w as Dictionary)["type"] == weapon_type:
			return
	weapons.append({"type": weapon_type, "level": start_level})
	var mgr: Node = get_node_or_null("WeaponManager")
	if mgr:
		mgr.spawn_weapon(weapon_type, start_level)


func upgrade_weapon(weapon_type: String) -> void:
	for w in weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type and int(wd["level"]) < GameConfig.WEAPON_MAX_LEVEL:
			wd["level"] = int(wd["level"]) + 1
			return


func add_or_upgrade_tome(tome_type: String) -> void:
	for t in tomes:
		var td: Dictionary = t as Dictionary
		if td["type"] == tome_type:
			var def: Dictionary = Tomes.get_def(tome_type)
			if int(td["level"]) < int(def.get("max_level", 8)):
				td["level"] = int(td["level"]) + 1
			return
	tomes.append({"type": tome_type, "level": 1})
	_recompute_stats()


## 简化版 stat 重算：把当前 tomes 累加进玩家属性。
## 完整版应该是 four-layer stat pipeline（base + added + increased + more），
## M4/M5 再做；批 1-3 用「reset base 再 累加 tomes」的简化。
func _recompute_stats() -> void:
	var char_def: Dictionary = Characters.get_def("megachad")
	max_hp = float(char_def["hp"])
	move_speed = float(char_def["speed"])
	damage_mult = float(char_def["damage"])
	armor = float(char_def["armor"])
	crit_chance = float(char_def["crit_chance"])
	crit_damage = GameConfig.PLAYER_BASE_CRIT_DAMAGE
	pickup_radius = GameConfig.PLAYER_PICKUP_RADIUS
	attack_speed_mult = 1.0

	for t in tomes:
		var def: Dictionary = Tomes.get_def((t as Dictionary)["type"])
		if def.is_empty() or def["category"] != "stat":
			continue
		var lv: int = int((t as Dictionary)["level"])
		var mods: Array = []
		if def.has("modifier"):
			mods.append(def["modifier"])
		if def.has("modifiers"):
			mods.append_array(def["modifiers"])
		for m in mods:
			_apply_stat_modifier(m as Dictionary, lv)

	hp = minf(hp, max_hp)
	hp_changed.emit(hp, max_hp)


func _apply_stat_modifier(mod: Dictionary, tome_level: int) -> void:
	var stat: String = mod["stat"]
	var v: float = float(mod["value_per_level"]) * tome_level
	match stat:
		"max_hp":
			if mod["kind"] == "added":
				max_hp += v
		"move_speed":
			if mod["kind"] == "increased":
				move_speed *= 1.0 + v
		"attack_speed":
			if mod["kind"] == "increased":
				attack_speed_mult *= 1.0 + v
		"armor":
			if mod["kind"] == "added":
				armor += v
		"crit_chance":
			if mod["kind"] == "added":
				crit_chance += v
		"crit_damage":
			if mod["kind"] == "added":
				crit_damage += v
		"pickup_radius":
			if mod["kind"] == "added":
				pickup_radius += v
