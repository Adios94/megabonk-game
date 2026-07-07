extends CanvasLayer
## 暂停菜单。ESC 键切换显示。

@onready var _panel: Control = $Panel


func _ready() -> void:
	_panel.visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	$Panel/VBox/ResumeBtn.pressed.connect(_on_resume)
	$Panel/VBox/MenuBtn.pressed.connect(_on_menu)
	$Panel/VBox/SfxSlider.value_changed.connect(_on_sfx_volume)
	$Panel/VBox/MusicSlider.value_changed.connect(_on_music_volume)
	$Panel/VBox/SfxSlider.value = Audio.get_sfx_volume()
	$Panel/VBox/MusicSlider.value = Audio.get_music_volume()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		_toggle()
		get_viewport().set_input_as_handled()


func _toggle() -> void:
	_panel.visible = not _panel.visible
	get_tree().paused = _panel.visible


func _on_resume() -> void:
	Audio.play_sfx("ui_click")
	_toggle()


func _on_menu() -> void:
	Audio.play_sfx("ui_click")
	get_tree().paused = false
	get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn")


func _on_sfx_volume(v: float) -> void:
	Audio.set_sfx_volume(v)


func _on_music_volume(v: float) -> void:
	Audio.set_music_volume(v)
