extends Control
## 商店面板。列 8 种永久升级，显示等级 / 花费 / 购买按钮。

signal closed

@onready var _list: VBoxContainer = $Panel/Margin/Scroll/List
@onready var _silver_label: Label = $Panel/Header/SilverLabel
@onready var _close_btn: Button = $Panel/Header/CloseBtn

var _rows: Array = []


func _ready() -> void:
	visible = false
	_close_btn.pressed.connect(_on_close)


func open() -> void:
	visible = true
	_rebuild()


func _rebuild() -> void:
	for r in _rows:
		if is_instance_valid(r):
			(r as Node).queue_free()
	_rows.clear()

	for u in Shop.UPGRADES:
		var upgrade: Dictionary = u as Dictionary
		var row: Control = _make_row(upgrade)
		_list.add_child(row)
		_rows.append(row)
	_update_silver()


func _make_row(upgrade: Dictionary) -> Control:
	var row: HBoxContainer = HBoxContainer.new()
	row.custom_minimum_size = Vector2(0, 56)

	var name: Label = Label.new()
	name.custom_minimum_size = Vector2(180, 0)
	name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var nk: String = upgrade["name_key"]
	var name_text: String = I18n.t(nk)
	if name_text.begins_with("shop."):
		name_text = str(upgrade["id"]).capitalize()
	name.text = name_text
	row.add_child(name)

	var current_level: int = SaveGame.get_shop_level(upgrade["id"])
	var max_level: int = int(upgrade["max_level"])

	var level: Label = Label.new()
	level.custom_minimum_size = Vector2(120, 0)
	level.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	level.text = "%d / %d" % [current_level, max_level]
	row.add_child(level)

	var cost: int = Shop.get_next_cost(upgrade["id"], current_level)
	var btn: Button = Button.new()
	btn.custom_minimum_size = Vector2(180, 40)
	if cost < 0:
		btn.text = "已满级"
		btn.disabled = true
	else:
		btn.text = "购买 · %d 银币" % cost
		btn.disabled = SaveGame.get_silver() < cost
	btn.pressed.connect(_on_buy.bind(str(upgrade["id"])))
	row.add_child(btn)

	return row


func _on_buy(upgrade_id: String) -> void:
	var current_level: int = SaveGame.get_shop_level(upgrade_id)
	var cost: int = Shop.get_next_cost(upgrade_id, current_level)
	if cost < 0:
		return
	if not SaveGame.spend_silver(cost):
		return
	SaveGame.increment_shop_level(upgrade_id)
	_rebuild()


func _update_silver() -> void:
	_silver_label.text = "银币: %d" % SaveGame.get_silver()


func _on_close() -> void:
	visible = false
	closed.emit()
