extends CanvasLayer
## 局内 HUD。M2 版本：HP 条 + 存活秒数 + 死亡遮罩。

@export var player_path: NodePath

@onready var _hp_bar: ProgressBar = $HpBar
@onready var _hp_label: Label = $HpBar/Label
@onready var _time_label: Label = $TimeLabel
@onready var _death_panel: Control = $DeathPanel

var _player: Node


func _ready() -> void:
	_death_panel.visible = false
	if player_path.is_empty():
		_player = get_tree().get_first_node_in_group("player")
	else:
		_player = get_node_or_null(player_path)
	if _player:
		_player.hp_changed.connect(_on_hp_changed)
		_player.died.connect(_on_died)
		_on_hp_changed(_player.hp, _player.get_max_hp())


func _process(_delta: float) -> void:
	if GameManager:
		var t: float = GameManager.run_seconds
		var m := int(t) / 60
		var s := int(t) % 60
		_time_label.text = "%02d:%02d" % [m, s]


func _on_hp_changed(hp: float, max_hp: float) -> void:
	_hp_bar.max_value = max_hp
	_hp_bar.value = hp
	_hp_label.text = "%d / %d" % [int(round(hp)), int(round(max_hp))]


func _on_died() -> void:
	_death_panel.visible = true
