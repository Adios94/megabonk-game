extends Control
## 任务面板。列所有任务 + 进度 + 完成状态。

signal closed

@onready var _list: VBoxContainer = $Panel/Margin/Scroll/List
@onready var _close_btn: Button = $Panel/Header/CloseBtn

var _rows: Array = []


func _ready() -> void:
	visible = false
	_close_btn.pressed.connect(_on_close)


func open() -> void:
	visible = true
	# 打开时先扫一遍看有没有新完成的
	var newly: Array = Quests.check_completions()
	_rebuild()
	if not newly.is_empty():
		# 未来：弹提示；现在只 print
		print("[Quest] 新完成 %d 个任务：%s" % [newly.size(), newly])


func _rebuild() -> void:
	for r in _rows:
		if is_instance_valid(r):
			(r as Node).queue_free()
	_rows.clear()
	for q in Quests.QUESTS:
		var row: Control = _make_row(q as Dictionary)
		_list.add_child(row)
		_rows.append(row)


func _make_row(quest: Dictionary) -> Control:
	var row: HBoxContainer = HBoxContainer.new()
	row.custom_minimum_size = Vector2(0, 44)

	var desc: Label = Label.new()
	desc.custom_minimum_size = Vector2(360, 0)
	desc.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var t: String = I18n.t(quest["desc_key"])
	if t.begins_with("quest."):
		t = str(quest["desc_key"])
	desc.text = t
	row.add_child(desc)

	var progress: Label = Label.new()
	progress.custom_minimum_size = Vector2(120, 0)
	progress.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var cur: int = Quests.get_progress(quest)
	var target: int = int(quest["target"])
	progress.text = "%d / %d" % [cur, target]
	row.add_child(progress)

	var status: Label = Label.new()
	status.custom_minimum_size = Vector2(120, 0)
	status.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if Quests.is_completed(quest["id"]):
		status.text = "已完成 ✓"
		status.modulate = Color(0.4, 0.9, 0.4)
	elif cur >= target:
		status.text = "可领取"
		status.modulate = Color(0.95, 0.85, 0.35)
	else:
		status.text = "-"
	row.add_child(status)

	var reward: Label = Label.new()
	reward.custom_minimum_size = Vector2(180, 0)
	reward.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	reward.text = _describe_reward(quest)
	row.add_child(reward)

	return row


func _describe_reward(quest: Dictionary) -> String:
	var rt: String = quest["reward_type"]
	var rv: Variant = quest["reward_value"]
	match rt:
		"silver": return "+%d 银币" % int(rv)
		"weapon_unlock": return "解锁武器: %s" % str(rv)
		"character_unlock": return "解锁角色: %s" % str(rv)
		"weapon_slot": return "+%d 武器槽" % int(rv)
		"tome_unlock": return "解锁典籍: %s" % str(rv)
	return str(rv)


func _on_close() -> void:
	visible = false
	closed.emit()
