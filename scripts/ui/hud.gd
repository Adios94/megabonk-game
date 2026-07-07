extends CanvasLayer
## HUD 布局按 main 分支还原。视觉细节：
##   - Timer / Tier / Silver / Kill 都放半透明胶囊里
##   - Pause 按钮换 btn_pause_normal.png ↔ btn_resume_normal.png
##   - 击杀 / 银币前带真图标 (icon_killcount / coin_silver)
##   - 武器槽 / tome / consumable / relic 用 frame_item_* 边框
##   - Relic 栏用 hud_relic_bar_bg.svg 大背景
##   - 任务条用 hud_task_track_bg.svg 底图

@export var player_path: NodePath

@onready var _hp_bar: TextureProgressBar = $TopLeft/HpRow/HpBar
@onready var _hp_label: Label = $TopLeft/HpRow/HpBar/Label
@onready var _weapon_slots: HBoxContainer = $TopLeft/WeaponSlots
@onready var _quest_track: NinePatchRect = $TopLeft/QuestTrack
@onready var _quest_hint: Label = $TopLeft/QuestTrack/HBox/QuestLabel

@onready var _timer_pill: PanelContainer = $TopCenter/TimerPill
@onready var _timer_label: Label = $TopCenter/TimerPill/TimerLabel

@onready var _tier_pill: PanelContainer = $TopRight/TopRow/TierPill
@onready var _tier_label: Label = $TopRight/TopRow/TierPill/Label
@onready var _silver_pill: PanelContainer = $TopRight/TopRow/SilverPill
@onready var _silver_label: Label = $TopRight/TopRow/SilverPill/HBox/SilverLabel
@onready var _kill_pill: PanelContainer = $TopRight/TopRow/KillPill
@onready var _kill_label: Label = $TopRight/TopRow/KillPill/HBox/KillLabel
@onready var _pause_btn: Button = $TopRight/TopRow/PauseBtn
@onready var _pause_icon: TextureRect = $TopRight/TopRow/PauseBtn/Icon
@onready var _tome_row: HBoxContainer = $TopRight/TomeRow

@onready var _consumable_row: HBoxContainer = $BottomGroup/BuffRow/ConsumableRow
@onready var _bond_row: HBoxContainer = $BottomGroup/BuffRow/BondRow
@onready var _xp_bar: TextureProgressBar = $BottomGroup/XpWrap/XpBar
@onready var _xp_label: Label = $BottomGroup/XpWrap/LevelLabel
@onready var _relic_bar: NinePatchRect = $BottomGroup/RelicBar
@onready var _relic_hbox: HBoxContainer = $BottomGroup/RelicBar/HBox

@onready var _boss_hp_container: Control = $BossHp
@onready var _boss_hp_bar: TextureProgressBar = $BossHp/Bar
@onready var _boss_phase_label: Label = $BossHp/PhaseLabel

@onready var _final_swarm_label: Label = $FinalSwarmLabel

const SLOT_SIZE := 44
const TOME_SIZE := 36
const RELIC_SLOT_COUNT := 10

const PAUSE_ICON_NORMAL := "res://assets/ui/button/btn_pause_normal.png"
const PAUSE_ICON_RESUME := "res://assets/ui/button/btn_resume_normal.png"
const ICON_KILL := "res://assets/ui/icon/icon_killcount.png"
const ICON_COIN_SILVER := "res://assets/ui/icon/coin_silver.png"

const FRAME_COMMON := "res://assets/ui/panel/svg/frame_item_common.svg"
const FRAME_BOND := "res://assets/ui/panel/svg/frame_item_bond.svg"
const FRAME_RARE := "res://assets/ui/panel/svg/frame_item_rare.svg"

var _player: Node
var _boss: Node
var _final_swarm_shown: bool = false
var _weapon_slot_nodes: Array = []
var _relic_slot_nodes: Array = []
var _bond_detail_overlay: PanelContainer


func _ready() -> void:
	_boss_hp_container.visible = false
	_final_swarm_label.visible = false
	_apply_styles()
	_build_weapon_slots()
	_build_relic_slots()
	_pause_btn.pressed.connect(_on_pause_pressed)

	if player_path.is_empty():
		_player = get_tree().get_first_node_in_group("player")
	else:
		_player = get_node_or_null(player_path)
	if _player:
		_player.hp_changed.connect(_on_hp_changed)
		_player.xp_changed.connect(_on_xp_changed)
		_player.kill_count_changed.connect(_on_kill_changed)
		_player.died.connect(_on_died)
		_on_hp_changed(float(_player.hp), float(_player.get_max_hp()))
		_on_xp_changed(int(_player.xp), int(_player.xp_to_next), int(_player.level))
		_on_kill_changed(int(_player.kill_count))

	if not EventBus.boss_spawned.is_connected(_on_boss_spawned):
		EventBus.boss_spawned.connect(_on_boss_spawned)

	var qtxt: String = I18n.t("hud.quest")
	if qtxt.begins_with("hud."):
		qtxt = "找到飞碟，召唤并击败BOSS！"
	_quest_hint.text = qtxt
	_update_tier_label()


func _apply_styles() -> void:
	Style.apply_bold(_hp_label, 14)
	Style.apply_bold(_timer_label, 22)
	Style.apply_bold(_tier_label, 16)
	Style.apply_bold(_silver_label, 16)
	Style.apply_bold(_kill_label, 16)
	Style.apply_bold(_xp_label, 15)
	Style.apply_bold(_boss_phase_label, 16)
	Style.apply_bold(_final_swarm_label, 56)
	Style.apply_plain(_quest_hint, 13)
	# 银币金色，击杀白色（有 icon 就够）
	_silver_label.add_theme_color_override("font_color", Color(1, 0.88, 0.45))


func _update_tier_label() -> void:
	var tier: int = GameManager.selected_tier
	var name_map: Dictionary = {1: "NORMAL", 2: "HARD", 3: "NIGHTMARE"}
	var col_map: Dictionary = {1: Color(0.55, 0.9, 0.55), 2: Color(1, 0.85, 0.35), 3: Color(1, 0.4, 0.4)}
	_tier_label.text = name_map.get(tier, "T?")
	Style.apply_colored(_tier_label, col_map.get(tier, Color(1, 1, 1)), 16, true)


func _process(_delta: float) -> void:
	var t: float = GameManager.run_seconds
	@warning_ignore("integer_division")
	var m: int = int(t) / 60
	var s: int = int(t) % 60
	_timer_label.text = "%02d:%02d" % [m, s]
	_silver_label.text = "%d" % GameManager.run_silver
	if not _final_swarm_shown and t >= GameConfig.FINAL_SWARM_START_TIME:
		_final_swarm_shown = true
		_show_final_swarm_banner()
	_refresh_weapon_slots()
	_refresh_bond_row()
	_refresh_consumable_row()
	_refresh_tome_row()
	_refresh_relic_slots()


func _on_hp_changed(hp: float, max_hp: float) -> void:
	_hp_bar.max_value = max_hp
	_hp_bar.value = hp
	_hp_label.text = "%d / %d" % [int(round(hp)), int(round(max_hp))]


func _on_xp_changed(xp: int, xp_to_next: int, level: int) -> void:
	_xp_bar.max_value = xp_to_next
	_xp_bar.value = xp
	_xp_label.text = "Lv %d" % level


func _on_kill_changed(count: int) -> void:
	_kill_label.text = "%d" % count


func _on_died() -> void:
	pass


func _on_pause_pressed() -> void:
	Audio.play_sfx("ui_click")
	var pause: Node = get_tree().current_scene.get_node_or_null("PauseMenu")
	if pause and pause.has_method("_toggle"):
		pause._toggle()
	# 切图标
	var paused: bool = get_tree().paused
	if ResourceLoader.exists(PAUSE_ICON_RESUME if paused else PAUSE_ICON_NORMAL):
		_pause_icon.texture = load(PAUSE_ICON_RESUME if paused else PAUSE_ICON_NORMAL)


func _on_boss_spawned(boss) -> void:
	_boss = boss
	if boss == null:
		return
	_boss_hp_container.visible = true
	if boss.has_signal("hp_changed"):
		boss.hp_changed.connect(_on_boss_hp_changed)


func _on_boss_hp_changed(hp: float, max_hp: float, phase: int) -> void:
	_boss_hp_bar.max_value = max_hp
	_boss_hp_bar.value = hp
	_boss_phase_label.text = "BOSS · P%d" % phase
	if hp <= 0.0:
		_boss_hp_container.visible = false


func _show_final_swarm_banner() -> void:
	_final_swarm_label.visible = true
	_final_swarm_label.modulate.a = 1.0
	var tw: Tween = create_tween()
	tw.tween_interval(2.0)
	tw.tween_property(_final_swarm_label, "modulate:a", 0.0, 1.0)
	tw.tween_callback(func(): _final_swarm_label.visible = false)


# --- 武器槽（带 frame 边框） ---

func _build_weapon_slots() -> void:
	for child in _weapon_slots.get_children():
		child.queue_free()
	_weapon_slot_nodes.clear()
	for i in 6:
		var slot: Control = _make_framed_slot(SLOT_SIZE, FRAME_COMMON)
		var icon: TextureRect = slot.get_node("Icon")
		var lv: Label = slot.get_node("Level")
		_weapon_slots.add_child(slot)
		_weapon_slot_nodes.append({"slot": slot, "icon": icon, "level": lv})


func _make_framed_slot(size: int, frame_path: String) -> Control:
	var root: Control = Control.new()
	root.custom_minimum_size = Vector2(size, size)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var frame: NinePatchRect = NinePatchRect.new()
	frame.name = "Frame"
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.patch_margin_left = 8
	frame.patch_margin_top = 8
	frame.patch_margin_right = 8
	frame.patch_margin_bottom = 8
	if ResourceLoader.exists(frame_path):
		frame.texture = load(frame_path)
	root.add_child(frame)

	var icon: TextureRect = TextureRect.new()
	icon.name = "Icon"
	icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	icon.offset_left = 5
	icon.offset_top = 5
	icon.offset_right = -5
	icon.offset_bottom = -5
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(icon)

	var lv: Label = Label.new()
	lv.name = "Level"
	lv.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	lv.offset_left = -22
	lv.offset_top = -18
	lv.offset_right = -3
	lv.offset_bottom = -2
	Style.apply_bold(lv, 11)
	lv.add_theme_color_override("font_color", Color(1, 0.9, 0.4))
	root.add_child(lv)
	return root


func _refresh_weapon_slots() -> void:
	if _player == null:
		return
	var weapons: Array = _player.weapons as Array
	for i in _weapon_slot_nodes.size():
		var slot_dict: Dictionary = _weapon_slot_nodes[i]
		if i < weapons.size():
			var w: Dictionary = weapons[i] as Dictionary
			var path: String = "res://assets/ui/icon/weapon/%s.png" % w["type"]
			if ResourceLoader.exists(path):
				(slot_dict["icon"] as TextureRect).texture = load(path)
			(slot_dict["level"] as Label).text = "L%d" % int(w["level"])
			(slot_dict["slot"] as Control).modulate = Color(1, 1, 1)
		else:
			(slot_dict["icon"] as TextureRect).texture = null
			(slot_dict["level"] as Label).text = ""
			(slot_dict["slot"] as Control).modulate = Color(0.5, 0.5, 0.5, 0.55)


# --- Tome 行 ---

func _refresh_tome_row() -> void:
	if _player == null:
		return
	var tomes: Array = _player.tomes as Array
	if _tome_row.get_child_count() != tomes.size():
		for child in _tome_row.get_children():
			child.queue_free()
		for t in tomes:
			var td: Dictionary = t as Dictionary
			var slot: Control = _make_framed_slot(TOME_SIZE, FRAME_COMMON)
			var icon: TextureRect = slot.get_node("Icon")
			var lv: Label = slot.get_node("Level")
			var path: String = "res://assets/ui/icon/tome/%s.png" % td["type"]
			if ResourceLoader.exists(path):
				icon.texture = load(path)
			lv.text = "L%d" % int(td["level"])
			lv.add_theme_color_override("font_color", Color(0.55, 0.9, 1))
			_tome_row.add_child(slot)


# --- Bond 底部行（带 frame_item_bond 边框，可点击弹详情） ---

func _refresh_bond_row() -> void:
	if _player == null:
		return
	var active: Array = []
	for bond_id in Bonds.ALL_BOND_IDS:
		var tier: int = int((_player.bonds as Dictionary).get(bond_id, 0))
		if tier > 0:
			active.append({"id": bond_id, "tier": tier})
	if _bond_row.get_child_count() == active.size():
		return
	for child in _bond_row.get_children():
		child.queue_free()
	for a in active:
		var ad: Dictionary = a as Dictionary
		var def: Dictionary = Bonds.BONDS.get(ad["id"], {}) as Dictionary
		var slot: Control = _make_framed_slot(TOME_SIZE, FRAME_BOND)
		var icon_slot: Node = slot.get_node("Icon")
		# 用 Label 显示 emoji（bond icon 是 emoji 字符）
		icon_slot.queue_free()
		var emoji_lbl: Label = Label.new()
		emoji_lbl.name = "Icon"
		emoji_lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		emoji_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		emoji_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		emoji_lbl.text = def.get("icon", "•")
		emoji_lbl.add_theme_font_size_override("font_size", 22)
		slot.add_child(emoji_lbl)
		(slot.get_node("Level") as Label).text = "T%d" % int(ad["tier"])
		# 点击弹详情
		var btn: Button = Button.new()
		btn.flat = true
		btn.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		btn.pressed.connect(_on_bond_pressed.bind(ad["id"], int(ad["tier"])))
		slot.add_child(btn)
		_bond_row.add_child(slot)


func _on_bond_pressed(bond_id: String, tier: int) -> void:
	Audio.play_sfx("ui_click")
	_show_bond_detail(bond_id, tier)


func _show_bond_detail(bond_id: String, tier: int) -> void:
	if _bond_detail_overlay:
		_bond_detail_overlay.queue_free()
	_bond_detail_overlay = PanelContainer.new()
	_bond_detail_overlay.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	_bond_detail_overlay.offset_left = 24
	_bond_detail_overlay.offset_top = -240
	_bond_detail_overlay.offset_right = 340
	_bond_detail_overlay.offset_bottom = -140
	_bond_detail_overlay.z_index = 240

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	_bond_detail_overlay.add_child(vbox)

	var def: Dictionary = Bonds.BONDS.get(bond_id, {}) as Dictionary
	var title: Label = Label.new()
	var name_txt: String = I18n.t(def.get("name_key", ""))
	if name_txt.begins_with("bond."):
		name_txt = bond_id.replace("_", " ").capitalize()
	title.text = "%s %s · T%d" % [def.get("icon", "•"), name_txt, tier]
	Style.apply_bold(title, 18)
	vbox.add_child(title)

	var weapons_lbl: Label = Label.new()
	var group: Array = def.get("weapons", [])
	var group_str: String = ""
	for i in group.size():
		if i > 0:
			group_str += ", "
		group_str += str(group[i])
	weapons_lbl.text = "羁绊武器：%s" % group_str
	weapons_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	Style.apply_plain(weapons_lbl, 12)
	vbox.add_child(weapons_lbl)

	var t1_desc: Label = Label.new()
	var t1: Dictionary = def.get("t1", {}) as Dictionary
	var lines: Array = []
	if t1.has("damage_inc"): lines.append("+%d%% 伤害" % int(float(t1["damage_inc"]) * 100))
	if t1.has("armor"): lines.append("+%d 护甲" % int(t1["armor"]))
	if t1.has("attack_speed"): lines.append("+%d%% 攻速" % int(float(t1["attack_speed"]) * 100))
	if t1.has("crit_chance"): lines.append("+%d%% 暴击率" % int(float(t1["crit_chance"]) * 100))
	if t1.has("crit_damage"): lines.append("+%d%% 暴击伤害" % int(float(t1["crit_damage"]) * 100))
	if t1.has("damage_mult"): lines.append("+%d%% 全局伤害" % int(float(t1["damage_mult"]) * 100))
	if t1.has("debuff_duration"): lines.append("+%.1fs debuff 持续" % float(t1["debuff_duration"]))
	if t1.has("damage_inc_close"): lines.append("+%d%% 近战伤害" % int(float(t1["damage_inc_close"]) * 100))
	if t1.has("damage_inc_hp_above_50"): lines.append("+%d%% 伤害（HP>50%%）" % int(float(t1["damage_inc_hp_above_50"]) * 100))
	var lines_str: String = ""
	for i in lines.size():
		if i > 0:
			lines_str += " / "
		lines_str += str(lines[i])
	t1_desc.text = "T1: " + lines_str if not lines.is_empty() else "T1: 数值加成"
	t1_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	Style.apply_plain(t1_desc, 13)
	t1_desc.add_theme_color_override("font_color", Color(0.85, 0.9, 0.6))
	vbox.add_child(t1_desc)

	if tier >= 2:
		var t2_lbl: Label = Label.new()
		t2_lbl.text = "T2 机制：%s (未来实装)" % def.get("mechanic_id", "?")
		t2_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		Style.apply_plain(t2_lbl, 12)
		t2_lbl.add_theme_color_override("font_color", Color(0.6, 0.8, 1))
		vbox.add_child(t2_lbl)

	# 点击外部关闭
	var closer: Button = Button.new()
	closer.flat = true
	closer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	closer.pressed.connect(_close_bond_detail)
	add_child(closer)
	closer.z_index = 239
	# 挂 detail 到顶层
	add_child(_bond_detail_overlay)


func _close_bond_detail() -> void:
	if _bond_detail_overlay:
		_bond_detail_overlay.queue_free()
		_bond_detail_overlay = null
	# 移除 closer button（最后加的 Button）
	for c in get_children():
		if c is Button and (c as Button).flat and (c as Button).z_index == 239:
			c.queue_free()


# --- Consumable 底部行 ---

func _refresh_consumable_row() -> void:
	if _player == null:
		return
	var buffs_raw: Variant = _player.get("_timed_buffs")
	var buffs: Dictionary = buffs_raw as Dictionary if buffs_raw != null else {}
	if _consumable_row.get_child_count() == buffs.size():
		var i: int = 0
		for k in buffs:
			var child: Control = _consumable_row.get_child(i) as Control
			if child == null:
				break
			var time_lbl: Label = child.get_node_or_null("Time")
			if time_lbl:
				time_lbl.text = "%.1fs" % float(buffs[k])
			i += 1
		return
	for child in _consumable_row.get_children():
		child.queue_free()
	for k in buffs:
		var def: Dictionary = Consumables.DEFS.get(k, {}) as Dictionary
		var slot: Control = _make_framed_slot(TOME_SIZE, FRAME_RARE)
		# 图标：用 emoji（consumable_items 目录里的 png 是完整食物 3D 图，跟 emoji 不搭 —— 用 emoji）
		var icon_node: Node = slot.get_node("Icon")
		icon_node.queue_free()
		var emoji: Label = Label.new()
		emoji.name = "Icon"
		emoji.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		emoji.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		emoji.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		emoji.text = def.get("emoji", "?")
		emoji.add_theme_font_size_override("font_size", 22)
		slot.add_child(emoji)
		# 时间显示（复用 Level 位置）
		var time_lbl: Label = slot.get_node("Level") as Label
		time_lbl.name = "Time"
		time_lbl.text = "%.1fs" % float(buffs[k])
		time_lbl.add_theme_color_override("font_color", Color(0.9, 0.9, 1))
		_consumable_row.add_child(slot)


# --- Relic 底部栏（用 hud_relic_bar_bg 大背景 + 每格 hud_relic_slot） ---

func _build_relic_slots() -> void:
	_relic_slot_nodes.clear()
	for child in _relic_hbox.get_children():
		child.queue_free()
	for i in RELIC_SLOT_COUNT:
		var slot: Control = Control.new()
		slot.custom_minimum_size = Vector2(34, 34)
		var slot_bg: NinePatchRect = NinePatchRect.new()
		slot_bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var slot_bg_path: String = "res://assets/ui/panel/svg/hud_relic_slot.svg"
		if ResourceLoader.exists(slot_bg_path):
			slot_bg.texture = load(slot_bg_path)
		slot_bg.patch_margin_left = 6
		slot_bg.patch_margin_top = 6
		slot_bg.patch_margin_right = 6
		slot_bg.patch_margin_bottom = 6
		slot.add_child(slot_bg)
		var lbl: Label = Label.new()
		lbl.name = "Icon"
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		lbl.add_theme_font_size_override("font_size", 20)
		slot.add_child(lbl)
		var count_lbl: Label = Label.new()
		count_lbl.name = "Count"
		count_lbl.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
		count_lbl.offset_left = -14
		count_lbl.offset_top = -14
		count_lbl.offset_right = -2
		count_lbl.offset_bottom = -2
		Style.apply_bold(count_lbl, 10)
		count_lbl.add_theme_color_override("font_color", Color(1, 0.85, 0.35))
		slot.add_child(count_lbl)
		_relic_hbox.add_child(slot)
		_relic_slot_nodes.append({"slot": slot, "bg": slot_bg, "label": lbl, "count": count_lbl})


func _refresh_relic_slots() -> void:
	if _player == null:
		return
	var relics: Dictionary = _player.relics as Dictionary
	var i: int = 0
	for rid in Relics.ALL_RELIC_IDS:
		if i >= _relic_slot_nodes.size():
			break
		var stack: int = int(relics.get(rid, 0))
		if stack > 0:
			var def: Dictionary = Relics.RELICS.get(rid, {}) as Dictionary
			var slot: Dictionary = _relic_slot_nodes[i]
			(slot["label"] as Label).text = def.get("emoji", "•")
			(slot["count"] as Label).text = "%d" % stack if stack > 1 else ""
			(slot["slot"] as Control).modulate = Color(1, 1, 1)
			i += 1
	while i < _relic_slot_nodes.size():
		var slot: Dictionary = _relic_slot_nodes[i]
		(slot["label"] as Label).text = ""
		(slot["count"] as Label).text = ""
		(slot["slot"] as Control).modulate = Color(1, 1, 1, 0.5)
		i += 1
