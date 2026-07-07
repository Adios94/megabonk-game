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

# Shrine 累加型 bonuses（乘算叠加，不被 recompute 清）
var shrine_damage_mult := 1.0
var shrine_attack_speed_mult := 1.0
var shrine_move_speed_mult := 1.0
var shrine_pickup_radius_mult := 1.0
var shrine_crit_damage_add := 0.0
var shrine_projectile_bonus := 0
var shrine_knockback_mult := 1.0
var shrine_lifesteal := 0.0
var shrine_luck_bonus := 0.0
var shrine_elite_damage_mult := 1.0
var shrine_hp_regen := 0.0
var max_shield := 0.0
var shield := 0.0

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

# Bond 状态：bond_id → tier（0-3）
var bonds: Dictionary = {}
# Relics：relic_id → stacks
var relics: Dictionary = {}

# Consumable timed buffs: id → 剩余秒数
var _timed_buffs: Dictionary = {}
# 每种 timed buff 的原始应用记录（用于到期回滚）
var _buff_hot_soup_applied: bool = false
var _buff_mint_candy_applied: bool = false
var _buff_energy_bar_applied: bool = false
var _buff_iron_meal_applied: bool = false
var _buff_rage_applied: bool = false
var _buff_magnet_applied: bool = false

var _is_dead := false
var _slide_timer := 0.0
var _slide_cooldown := 0.0
var _land_timer := INF
var _was_on_floor := true
var _invincible_timer := 0.0


func _ready() -> void:
	add_to_group("player")
	GameManager.start_run()
	Audio.play_music("fight1", 1.0)
	_apply_character(GameManager.selected_character)
	# 动画 rig
	var rig: Node = get_node_or_null("Model")
	if rig and rig.has_method("set_owner_body"):
		rig.set_owner_body(self)
	# defer 一帧发信号，等 HUD 连上
	hp_changed.emit.call_deferred(hp, max_hp)
	xp_changed.emit.call_deferred(xp, xp_to_next, level)
	kill_count_changed.emit.call_deferred(kill_count)
	# EventBus 敌人死亡 → 计数
	if EventBus.enemy_died.is_connected(_on_enemy_died):
		EventBus.enemy_died.disconnect(_on_enemy_died)
	EventBus.enemy_died.connect(_on_enemy_died)


func _apply_character(char_id: String) -> void:
	var def: Dictionary = Characters.get_def(char_id)
	if def.is_empty():
		return
	# 基础属性
	max_hp = float(def["hp"])
	hp = max_hp
	move_speed = float(def["speed"])
	damage_mult = float(def["damage"])
	armor = float(def["armor"])
	crit_chance = float(def["crit_chance"])
	# 商店永久加成
	max_hp += float(SaveGame.get_shop_level("max_hp")) * 10.0
	hp = max_hp
	damage_mult += float(SaveGame.get_shop_level("damage")) * 0.05
	move_speed += float(SaveGame.get_shop_level("speed")) * 0.3
	crit_chance += float(SaveGame.get_shop_level("crit")) * 0.02
	pickup_radius += float(SaveGame.get_shop_level("pickup_radius")) * 0.5
	armor += float(SaveGame.get_shop_level("armor")) * 1.0
	# 起手等级
	var start_lv: int = SaveGame.get_shop_level("starting_level")
	for _i in start_lv:
		level += 1
		xp_to_next = GameConfig.xp_for_level(level)
	# 武器槽（extra 来自任务）
	max_weapon_slots = int(def["weapon_slots"]) + int(SaveGame.data.get("extra_weapon_slots", 0))
	# 起手武器
	var starter: String = str(def["starting_weapon"])
	add_weapon(starter, 1)


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

	# HP regen (来自 Shrine hp_regen + Relic regen_core)
	if shrine_hp_regen > 0.0 and hp > 0.0 and hp < max_hp:
		hp = minf(max_hp, hp + shrine_hp_regen * delta)
		hp_changed.emit(hp, max_hp)

	# Consumable timed buffs
	_tick_timed_buffs(delta)


func take_damage(amount: float) -> void:
	if _is_dead or _invincible_timer > 0.0:
		return
	var final_dmg: float = max(1.0, amount - armor)
	# 护盾优先扣
	var is_shield_hit: bool = false
	if shield > 0.0:
		var absorbed: float = minf(shield, final_dmg)
		shield -= absorbed
		final_dmg -= absorbed
		is_shield_hit = absorbed > 0.0
	hp = max(0.0, hp - final_dmg)
	_invincible_timer = GameConfig.PLAYER_INVINCIBLE_DURATION
	Audio.play_sfx("player_hurt", 0.1)
	var rig: Node = get_node_or_null("Model")
	if rig and rig.has_method("play_hit"):
		rig.play_hit()
	# 浮字（玩家受伤 = 红字；护盾吸收 = 蓝字）
	EventBus.damage_dealt.emit(global_position + Vector3(0.0, 1.6, 0.0), amount, false, true, is_shield_hit)
	hp_changed.emit(hp, max_hp)
	if hp <= 0.0:
		_die()


func _die() -> void:
	_is_dead = true
	velocity = Vector3.ZERO
	Audio.play_sfx("player_gameover")
	Audio.stop_music(1.0)
	var rig: Node = get_node_or_null("Model")
	if rig and rig.has_method("play_death"):
		rig.play_death()
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
	# Trait: megachad xp_bonus
	var traits_result: Dictionary = Traits.compute(self)
	if traits_result.has("xp_bonus"):
		bonus *= 1.0 + float(traits_result["xp_bonus"])
	var final_xp: int = int(round(amount * bonus))
	xp += final_xp
	while xp >= xp_to_next and level < GameConfig.MAX_LEVEL:
		xp -= xp_to_next
		level += 1
		xp_to_next = GameConfig.xp_for_level(level)
		max_weapon_slots = GameConfig.compute_weapon_slots(level, 5)
		Audio.play_sfx("player_levelup")
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
	_recompute_bonds()


func upgrade_weapon(weapon_type: String) -> void:
	for w in weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type and int(wd["level"]) < GameConfig.WEAPON_MAX_LEVEL:
			wd["level"] = int(wd["level"]) + 1
			_recompute_bonds()
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


# --- Shrine 奖励应用 ---

func apply_shrine_reward(reward: Dictionary) -> void:
	var kind: String = reward["reward"]
	var v: float = float(reward["value"])
	# 直接把增量应用到属性；shrine_*_mult 状态只用于查询/UI，不做基准还原。
	match kind:
		"damage":
			damage_mult *= 1.0 + v
			shrine_damage_mult *= 1.0 + v
		"attack_speed":
			attack_speed_mult *= 1.0 + v
			shrine_attack_speed_mult *= 1.0 + v
		"movement_speed":
			move_speed *= 1.0 + v
			shrine_move_speed_mult *= 1.0 + v
		"pickup_range":
			pickup_radius *= 1.0 + v
			shrine_pickup_radius_mult *= 1.0 + v
		"crit_damage":
			crit_damage += v
			shrine_crit_damage_add += v
		"knockback":
			shrine_knockback_mult *= 1.0 + v
		"lifesteal":
			shrine_lifesteal = minf(1.0, shrine_lifesteal + v)
		"luck":
			shrine_luck_bonus += v
		"elite_damage":
			shrine_elite_damage_mult *= 1.0 + v
		"shield":
			max_shield += v
			shield = max_shield
		"hp_regen":
			shrine_hp_regen += v
		"projectile_count":
			shrine_projectile_bonus += int(v)


# --- Bond 羁绊 ---

## 每次装 / 升武器后重算所有 bond 档位，delta 应用 T1 数值。
func _recompute_bonds() -> void:
	var new_tiers: Dictionary = Bonds.compute_all_tiers(weapons)
	for bond_id in Bonds.ALL_BOND_IDS:
		var old_tier: int = int(bonds.get(bond_id, 0))
		var new_tier: int = int(new_tiers.get(bond_id, 0))
		if new_tier == old_tier:
			continue
		# 应用 T1 差量（简化：只有 0↔1 切换会加/减 T1 数值；T2/T3 只记 tier）
		if old_tier == 0 and new_tier >= 1:
			_apply_bond_t1(bond_id, 1.0)
		elif old_tier >= 1 and new_tier == 0:
			_apply_bond_t1(bond_id, -1.0)
		bonds[bond_id] = new_tier


func _apply_bond_t1(bond_id: String, sign: float) -> void:
	var def: Dictionary = Bonds.BONDS.get(bond_id, {}) as Dictionary
	if def.is_empty() or not def.has("t1"):
		return
	var t1: Dictionary = def["t1"] as Dictionary
	if t1.has("damage_inc"):
		damage_mult *= 1.0 + float(t1["damage_inc"]) * sign
	if t1.has("damage_inc_close"):
		damage_mult *= 1.0 + float(t1["damage_inc_close"]) * sign * 0.5   # 简化：近战加成折半
	if t1.has("damage_inc_hp_above_50"):
		damage_mult *= 1.0 + float(t1["damage_inc_hp_above_50"]) * sign * 0.7
	if t1.has("damage_mult"):
		damage_mult += float(t1["damage_mult"]) * sign
	if t1.has("armor"):
		armor += float(t1["armor"]) * sign
	if t1.has("attack_speed"):
		attack_speed_mult *= 1.0 + float(t1["attack_speed"]) * sign
	if t1.has("crit_chance"):
		crit_chance += float(t1["crit_chance"]) * sign
	if t1.has("crit_damage"):
		crit_damage += float(t1["crit_damage"]) * sign


func get_bond_tier(bond_id: String) -> int:
	return int(bonds.get(bond_id, 0))


# --- Relic 遗物 ---

## 每层效果（增量应用；每次拾取都会加）
func apply_relic(relic_id: String) -> void:
	var s: int = int(relics.get(relic_id, 0))
	relics[relic_id] = s + 1
	match relic_id:
		"keen_lens":         # 暴击 +3% / stack
			crit_chance += 0.03
		"small_shield_charm": # 护甲 +2 / stack
			armor += 2.0
		"pact_coin":          # 局内银币 +10 / stack（触发时也影响）
			pass
		"blood_fang":         # 生命偷取 +5% / stack
			shrine_lifesteal = minf(1.0, shrine_lifesteal + 0.05)
		"elite_writ":         # 对精英 +10% / stack
			shrine_elite_damage_mult *= 1.10
		"regen_core":         # HP 回复 +2/s / stack
			shrine_hp_regen += 2.0
		"arsenal_badge":      # damage +8% / stack
			damage_mult *= 1.08
		"magazine_expander":  # projectile +1 / stack
			shrine_projectile_bonus += 1
		"hourglass":          # attack_speed +12% / stack
			attack_speed_mult *= 1.12
		"iron_heart":         # max_hp +20 + 完全治愈 / stack
			max_hp += 20.0
			hp = max_hp
	hp_changed.emit(hp, max_hp)


# --- Consumables ---

func apply_consumable(cid: String) -> void:
	var def: Dictionary = Consumables.DEFS.get(cid, {}) as Dictionary
	if def.is_empty():
		return
	Audio.play_sfx("pickup_eat", 0.1)
	match cid:
		"wild_berry":
			heal(30.0)
		"hard_bread":
			_invincible_timer = 5.0
		"prophecy_book":
			# TODO：下次升级 4 选 1（M9 再做）
			pass
		"craftsman_hammer":
			# 强化一把随机武器（等级 +1）
			if not weapons.is_empty():
				var w: Dictionary = weapons[randi() % weapons.size()] as Dictionary
				if int(w["level"]) < GameConfig.WEAPON_MAX_LEVEL:
					w["level"] = int(w["level"]) + 1
					_recompute_bonds()
		"hot_soup":
			if not _buff_hot_soup_applied:
				damage_mult *= 1.25
				_buff_hot_soup_applied = true
			_timed_buffs[cid] = 15.0
		"mint_candy":
			if not _buff_mint_candy_applied:
				move_speed *= 1.25
				_buff_mint_candy_applied = true
			_timed_buffs[cid] = 20.0
		"energy_bar":
			if not _buff_energy_bar_applied:
				attack_speed_mult *= 1.4
				_buff_energy_bar_applied = true
			_timed_buffs[cid] = 25.0
		"iron_meal":
			if not _buff_iron_meal_applied:
				armor += 5.0
				_buff_iron_meal_applied = true
			_timed_buffs[cid] = 30.0
		"rage_potion":
			if not _buff_rage_applied:
				damage_mult *= 2.0
				max_hp *= 0.5
				hp = minf(hp, max_hp)
				_buff_rage_applied = true
				hp_changed.emit(hp, max_hp)
			_timed_buffs[cid] = 20.0
		"magnet":
			if not _buff_magnet_applied:
				pickup_radius *= 6.0
				_buff_magnet_applied = true
			_timed_buffs[cid] = 25.0


func _tick_timed_buffs(delta: float) -> void:
	var expired: Array = []
	for id in _timed_buffs:
		var t: float = float(_timed_buffs[id]) - delta
		if t <= 0.0:
			expired.append(id)
		else:
			_timed_buffs[id] = t
	for id in expired:
		_timed_buffs.erase(id)
		_expire_buff(id)


func _expire_buff(id: String) -> void:
	match id:
		"hot_soup":
			if _buff_hot_soup_applied:
				damage_mult /= 1.25
				_buff_hot_soup_applied = false
		"mint_candy":
			if _buff_mint_candy_applied:
				move_speed /= 1.25
				_buff_mint_candy_applied = false
		"energy_bar":
			if _buff_energy_bar_applied:
				attack_speed_mult /= 1.4
				_buff_energy_bar_applied = false
		"iron_meal":
			if _buff_iron_meal_applied:
				armor -= 5.0
				_buff_iron_meal_applied = false
		"rage_potion":
			if _buff_rage_applied:
				damage_mult /= 2.0
				max_hp *= 2.0
				hp_changed.emit(hp, max_hp)
				_buff_rage_applied = false
		"magnet":
			if _buff_magnet_applied:
				pickup_radius /= 6.0
				_buff_magnet_applied = false
