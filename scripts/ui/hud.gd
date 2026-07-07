extends CanvasLayer
## HUD 布局按 main 分支还原：
##   顶左：HP 条 + 6 武器槽 + 任务条
##   顶中：Timer 胶囊
##   顶右：Tier + 金币 + 银币 + 击杀 + Pause + tome 行
##   底部：Buff 行（左消耗品 / 右 bond）+ XP 大绿条（level 骑边） + Relic 10 格栏

@export var player_path: NodePath

@onready var _hp_bar: TextureProgressBar = $TopLeft/HpRow/HpBar
@onready var _hp_label: Label = $TopLeft/HpRow/HpBar/Label
@onready var _weapon_slots: HBoxContainer = $TopLeft/WeaponSlots
@onready var _quest_hint: Label = $TopLeft/QuestHint

@onready var _timer_label: Label = $TopCenter/TimerPanel/TimerLabel

@onready var _tier_label: Label = $TopRight/TopRow/TierLabel
@onready var _silver_label: Label = $TopRight/TopRow/SilverLabel
@onready var _kill_label: Label = $TopRight/TopRow/KillLabel
@onready var _pause_btn: Button = $TopRight/TopRow/PauseBtn
@onready var _tome_row: HBoxContainer = $TopRight/TomeRow

@onready var _consumable_row: HBoxContainer = $BottomGroup/BuffRow/ConsumableRow
@onready var _bond_row: HBoxContainer = $BottomGroup/BuffRow/BondRow
@onready var _xp_bar: TextureProgressBar = $BottomGroup/XpWrap/XpBar
@onready var _xp_label: Label = $BottomGroup/XpWrap/LevelLabel
@onready var _relic_bar: Control = $BottomGroup/RelicBar

@onready var _boss_hp_container: Control = $BossHp
@onready var _boss_hp_bar: TextureProgressBar = $BossHp/Bar
@onready var _boss_phase_label: Label = $BossHp/PhaseLabel

@onready var _final_swarm_label: Label = $FinalSwarmLabel

const SLOT_SIZE := 44
const TOME_SIZE := 36
const RELIC_SLOT_COUNT := 10

var _player: Node
var _boss: Node
var _final_swarm_shown: bool = false
var _weapon_slot_nodes: Array = []
var _relic_slot_nodes: Array = []


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
	Style.apply_bold(_timer_label, 20)
	Style.apply_bold(_tier_label, 16)
	Style.apply_bold(_silver_label, 16)
	Style.apply_bold(_kill_label, 16)
	Style.apply_bold(_xp_label, 16)
	Style.apply_bold(_boss_phase_label, 16)
	Style.apply_bold(_final_swarm_label, 56)
	Style.apply_plain(_quest_hint, 14)


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
	_silver_label.text = "💰 %d" % GameManager.run_silver
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
	_kill_label.text = "☠ %d" % count


func _on_died() -> void:
	pass


func _on_pause_pressed() -> void:
	Audio.play_sfx("ui_click")
	var pause: Node = get_tree().current_scene.get_node_or_null("PauseMenu")
	if pause and pause.has_method("_toggle"):
		pause._toggle()


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


# --- 武器槽 ---

func _build_weapon_slots() -> void:
	for child in _weapon_slots.get_children():
		child.queue_free()
	_weapon_slot_nodes.clear()
	for i in 6:
		var slot: PanelContainer = PanelContainer.new()
		slot.custom_minimum_size = Vector2(SLOT_SIZE, SLOT_SIZE)
		var icon: TextureRect = TextureRect.new()
		icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.add_child(icon)
		var lv: Label = Label.new()
		lv.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
		lv.offset_left = -18
		lv.offset_top = -18
		lv.offset_right = -2
		lv.offset_bottom = -2
		Style.apply_bold(lv, 11)
		lv.add_theme_color_override("font_color", Color(1, 0.9, 0.4))
		slot.add_child(lv)
		_weapon_slots.add_child(slot)
		_weapon_slot_nodes.append({"panel": slot, "icon": icon, "level": lv})


func _refresh_weapon_slots() -> void:
	if _player == null:
		return
	var weapons: Array = _player.weapons as Array
	for i in _weapon_slot_nodes.size():
		var slot: Dictionary = _weapon_slot_nodes[i]
		if i < weapons.size():
			var w: Dictionary = weapons[i] as Dictionary
			var path: String = "res://assets/ui/icon/weapon/%s.png" % w["type"]
			if ResourceLoader.exists(path):
				(slot["icon"] as TextureRect).texture = load(path)
			(slot["level"] as Label).text = "L%d" % int(w["level"])
			(slot["panel"] as Control).modulate = Color(1, 1, 1)
		else:
			(slot["icon"] as TextureRect).texture = null
			(slot["level"] as Label).text = ""
			(slot["panel"] as Control).modulate = Color(0.4, 0.4, 0.4, 0.5)


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
			var slot: PanelContainer = PanelContainer.new()
			slot.custom_minimum_size = Vector2(TOME_SIZE, TOME_SIZE)
			var icon: TextureRect = TextureRect.new()
			icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var path: String = "res://assets/ui/icon/tome/%s.png" % td["type"]
			if ResourceLoader.exists(path):
				icon.texture = load(path)
			slot.add_child(icon)
			var lv: Label = Label.new()
			lv.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
			lv.offset_left = -14
			lv.offset_top = -14
			lv.offset_right = -2
			lv.offset_bottom = -2
			Style.apply_bold(lv, 10)
			lv.add_theme_color_override("font_color", Color(0.55, 0.9, 1))
			lv.text = "L%d" % int(td["level"])
			slot.add_child(lv)
			_tome_row.add_child(slot)


# --- Bond 底部行 ---

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
		var lbl: Label = Label.new()
		lbl.text = "%s%d" % [def.get("icon", "•"), int(ad["tier"])]
		Style.apply_bold(lbl, 20)
		_bond_row.add_child(lbl)


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
			var lbl_time: Label = child.get_node_or_null("Time")
			if lbl_time:
				lbl_time.text = "%.1fs" % float(buffs[k])
			i += 1
		return
	for child in _consumable_row.get_children():
		child.queue_free()
	for k in buffs:
		var def: Dictionary = Consumables.DEFS.get(k, {}) as Dictionary
		var slot: PanelContainer = PanelContainer.new()
		slot.custom_minimum_size = Vector2(TOME_SIZE, TOME_SIZE)
		var main_lbl: Label = Label.new()
		main_lbl.text = def.get("emoji", "?")
		main_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		main_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		main_lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		main_lbl.add_theme_font_size_override("font_size", 24)
		slot.add_child(main_lbl)
		var time_lbl: Label = Label.new()
		time_lbl.name = "Time"
		time_lbl.text = "%.1fs" % float(buffs[k])
		time_lbl.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
		time_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		time_lbl.offset_top = -14
		Style.apply_bold(time_lbl, 10)
		slot.add_child(time_lbl)
		_consumable_row.add_child(slot)


# --- Relic 底部栏 ---

func _build_relic_slots() -> void:
	for child in _relic_bar.get_children():
		child.queue_free()
	_relic_slot_nodes.clear()
	var hbox: HBoxContainer = HBoxContainer.new()
	hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	hbox.add_theme_constant_override("separation", 4)
	_relic_bar.add_child(hbox)
	for i in RELIC_SLOT_COUNT:
		var slot: PanelContainer = PanelContainer.new()
		slot.custom_minimum_size = Vector2(32, 32)
		var lbl: Label = Label.new()
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		lbl.add_theme_font_size_override("font_size", 18)
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
		hbox.add_child(slot)
		_relic_slot_nodes.append({"panel": slot, "label": lbl, "count": count_lbl})


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
			(slot["panel"] as Control).modulate = Color(1, 1, 1)
			i += 1
	while i < _relic_slot_nodes.size():
		var slot: Dictionary = _relic_slot_nodes[i]
		(slot["label"] as Label).text = ""
		(slot["count"] as Label).text = ""
		(slot["panel"] as Control).modulate = Color(0.4, 0.4, 0.4, 0.4)
		i += 1
