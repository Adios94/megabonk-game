extends CanvasLayer
## 伤害数字浮字 overlay。30 Label pool + round-robin。
## 监听 EventBus.damage_dealt(target_pos, amount, is_crit, is_player_damage, is_shield)。
##
## 对应旧版 client/ui/damageNumbers.ts。

const POOL_SIZE := 30

var _labels: Array[Label] = []
var _next_index: int = 0
var _camera: Camera3D


func _ready() -> void:
	layer = 200
	# 建 pool
	for i in POOL_SIZE:
		var lbl: Label = Label.new()
		lbl.modulate.a = 0.0
		lbl.z_index = 200
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		Style.apply_bold(lbl, 20)
		add_child(lbl)
		_labels.append(lbl)
	# 找主相机
	_camera = get_viewport().get_camera_3d()
	# 监听
	if not EventBus.damage_dealt.is_connected(_on_damage):
		EventBus.damage_dealt.connect(_on_damage)


func _process(_delta: float) -> void:
	if _camera == null or not is_instance_valid(_camera):
		_camera = get_viewport().get_camera_3d()


func _on_damage(target_pos: Vector3, amount: float, is_crit: bool, is_player_damage: bool, is_shield: bool) -> void:
	if _camera == null:
		return
	var screen_pos: Vector2 = _camera.unproject_position(target_pos)
	var lbl: Label = _labels[_next_index]
	_next_index = (_next_index + 1) % POOL_SIZE

	# 文本 + 颜色
	var text: String
	var color: Color
	if is_shield:
		text = "+%d" % int(round(amount))
		color = Style.FONT_COLOR_SHIELD
	elif is_player_damage:
		text = "%d" % int(round(amount))
		color = Style.FONT_COLOR_RED
	elif is_crit:
		text = "%d" % int(round(amount))
		color = Style.FONT_COLOR_GOLD
	else:
		text = "%d" % int(round(amount))
		color = Style.FONT_COLOR

	# 大小按伤害值
	var fs: int = 16
	if amount > 50:
		fs = 26
	elif amount > 20:
		fs = 20
	if is_crit:
		fs = int(fs * 1.5)
	Style.apply_colored(lbl, color, fs, true)
	lbl.text = text

	# defer 到下一帧读 label 尺寸，避免第一帧对齐失败
	lbl.size = Vector2.ZERO
	lbl.position = screen_pos - Vector2(30, 8)
	lbl.modulate = Color(1, 1, 1, 1)

	# GSAP-like 上浮 + 淡出（0.9s）
	var tw: Tween = create_tween()
	tw.set_parallel(true)
	var dy: float = -60.0
	if is_crit:
		# 暴击弹一下：先扩大 → 上浮 → 淡出
		lbl.scale = Vector2(1.6, 1.6)
		tw.tween_property(lbl, "scale", Vector2(1.0, 1.0), 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		lbl.scale = Vector2(1, 1)
	tw.tween_property(lbl, "position:y", lbl.position.y + dy, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(lbl, "modulate:a", 0.0, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN).set_delay(0.15)
