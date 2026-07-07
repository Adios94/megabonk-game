extends Control
## Bond HUD 状态栏。显示激活的 bond icon + tier。

var _rows: Dictionary = {}   # bond_id → Label
var _player: Node


func _ready() -> void:
	_player = get_tree().get_first_node_in_group("player")
	_rebuild()


func _process(_delta: float) -> void:
	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player")
		return
	# 每帧比较 bonds 状态；轻量
	for bond_id in Bonds.ALL_BOND_IDS:
		var tier: int = int((_player.bonds as Dictionary).get(bond_id, 0))
		if not _rows.has(bond_id):
			if tier > 0:
				_add_row(bond_id, tier)
		else:
			var lbl: Label = _rows[bond_id]
			if tier <= 0:
				lbl.queue_free()
				_rows.erase(bond_id)
			else:
				lbl.text = _format(bond_id, tier)


func _rebuild() -> void:
	for lbl in _rows.values():
		(lbl as Node).queue_free()
	_rows.clear()


func _add_row(bond_id: String, tier: int) -> void:
	var lbl: Label = Label.new()
	lbl.text = _format(bond_id, tier)
	lbl.theme_override_font_sizes["font_size"] = 16
	add_child(lbl)
	_rows[bond_id] = lbl


func _format(bond_id: String, tier: int) -> String:
	var def: Dictionary = Bonds.BONDS.get(bond_id, {}) as Dictionary
	var icon: String = def.get("icon", "•")
	return "%s T%d" % [icon, tier]
