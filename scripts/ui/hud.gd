extends CanvasLayer
## 局内 HUD。

@export var player_path: NodePath

@onready var _hp_bar: TextureProgressBar = $TopCenter/HpBox/HpBar
@onready var _hp_label: Label = $TopCenter/HpBox/HpBar/Label
@onready var _xp_bar: TextureProgressBar = $TopCenter/XpBox/XpBar
@onready var _xp_label: Label = $TopCenter/XpBox/XpBar/Label
@onready var _level_label: Label = $TopCenter/LevelBadge/Label
@onready var _time_label: Label = $TopRight/TimeLabel
@onready var _kill_label: Label = $TopRight/KillLabel
@onready var _silver_label: Label = $TopRight/SilverLabel
@onready var _quest_hint: Label = $QuestHint
@onready var _weapon_slots: HBoxContainer = $BottomLeft/WeaponSlots
@onready var _bond_row: HBoxContainer = $BottomLeft/BondRow
@onready var _final_swarm_label: Label = $FinalSwarmLabel
@onready var _boss_hp_container: Control = $BossHp
@onready var _boss_hp_bar: TextureProgressBar = $BossHp/Bar
@onready var _boss_phase_label: Label = $BossHp/PhaseLabel

var _player: Node
var _boss: Node
var _final_swarm_shown: bool = false
var _weapon_slot_nodes: Array = []
var _bond_row_nodes: Dictionary = {}


func _ready() -> void:
	_boss_hp_container.visible = false
	if is_instance_valid(_final_swarm_label):
		_final_swarm_label.visible = false
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
	_quest_hint.text = I18n.t("hud.quest") if not I18n.t("hud.quest").begins_with("hud.") else "找到飞碟，召唤并击败BOSS！"
	_build_weapon_slots()


func _process(_delta: float) -> void:
	var t: float = GameManager.run_seconds
	@warning_ignore("integer_division")
	var m: int = int(t) / 60
	var s: int = int(t) % 60
	_time_label.text = "%02d:%02d" % [m, s]
	_silver_label.text = "💰 %d" % GameManager.run_silver
	# Final Swarm 横幅
	if not _final_swarm_shown and t >= GameConfig.FINAL_SWARM_START_TIME:
		_final_swarm_shown = true
		_show_final_swarm_banner()
	# 武器槽 + bond 更新
	_refresh_weapon_slots()
	_refresh_bond_row()


func _on_hp_changed(hp: float, max_hp: float) -> void:
	_hp_bar.max_value = max_hp
	_hp_bar.value = hp
	_hp_label.text = "%d / %d" % [int(round(hp)), int(round(max_hp))]


func _on_xp_changed(xp: int, xp_to_next: int, level: int) -> void:
	_xp_bar.max_value = xp_to_next
	_xp_bar.value = xp
	_xp_label.text = "%d / %d" % [xp, xp_to_next]
	_level_label.text = "%d" % level


func _on_kill_changed(count: int) -> void:
	_kill_label.text = "☠ %d" % count


func _on_died() -> void:
	pass   # 交给 ResultPanel


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
	if not is_instance_valid(_final_swarm_label):
		return
	_final_swarm_label.visible = true
	_final_swarm_label.modulate.a = 1.0
	var tw: Tween = create_tween()
	tw.tween_interval(2.0)
	tw.tween_property(_final_swarm_label, "modulate:a", 0.0, 1.0)
	tw.tween_callback(func(): _final_swarm_label.visible = false)


# --- 武器槽栏 ---

func _build_weapon_slots() -> void:
	# 12 空槽（最多 12 把武器）
	for child in _weapon_slots.get_children():
		child.queue_free()
	_weapon_slot_nodes.clear()
	for i in 6:
		var slot: PanelContainer = PanelContainer.new()
		slot.custom_minimum_size = Vector2(52, 52)
		var icon: TextureRect = TextureRect.new()
		icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		slot.add_child(icon)
		var lv: Label = Label.new()
		lv.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
		lv.offset_left = -20
		lv.offset_top = -20
		lv.offset_right = -2
		lv.offset_bottom = -2
		lv.add_theme_font_size_override("font_size", 12)
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
			(slot["panel"] as Control).modulate = Color(0.5, 0.5, 0.5, 0.6)


# --- Bond 状态栏 ---

func _refresh_bond_row() -> void:
	if _player == null:
		return
	for bond_id in Bonds.ALL_BOND_IDS:
		var tier: int = int((_player.bonds as Dictionary).get(bond_id, 0))
		if tier > 0:
			if not _bond_row_nodes.has(bond_id):
				_add_bond_icon(bond_id, tier)
			else:
				(_bond_row_nodes[bond_id] as Label).text = _bond_text(bond_id, tier)
		elif _bond_row_nodes.has(bond_id):
			(_bond_row_nodes[bond_id] as Node).queue_free()
			_bond_row_nodes.erase(bond_id)


func _add_bond_icon(bond_id: String, tier: int) -> void:
	var lbl: Label = Label.new()
	lbl.text = _bond_text(bond_id, tier)
	lbl.add_theme_font_size_override("font_size", 22)
	_bond_row.add_child(lbl)
	_bond_row_nodes[bond_id] = lbl


func _bond_text(bond_id: String, tier: int) -> String:
	var def: Dictionary = Bonds.BONDS.get(bond_id, {}) as Dictionary
	var icon: String = def.get("icon", "•")
	return "%s%d" % [icon, tier]
