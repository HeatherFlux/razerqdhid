from basilisk_v3.device import BasiliskV3Device


class NagaV2HyperSpeedDevice(BasiliskV3Device):
    """
    Razer Naga V2 HyperSpeed, 2.4 GHz receiver (1532:00B4).

    Same 90-byte feature-report protocol as the Basilisk V3 (transaction id 0x1F),
    but the control interface is USB interface 0: the Mouse collection that carries
    the vendor (0xFF00) feature report. Interfaces 1 and 2 are plain keyboards with
    no feature report, which is how we tell them apart under WebHID (which does not
    expose interface numbers).

    Button IDs come from the device's own remappable-button table
    (class 0x02 / id 0x84):  01 02 03 34 35 0b 0c | 40..4b | 09 0a

    Verified on hardware by reading every id back with class 0x02 / id 0x8C
    on profiles 0x00 and 0x01. Factory bindings:
      0x01-0x03 left/right/middle, 0x34/0x35 wheel tilt (mouse 4/5),
      0x0b/0x0c DPI up/down, 0x09/0x0a wheel up/down,
      0x40..0x4B thumb 1..12 = keyboard 1..9, (see below), '-', '='.
    thumb_10 (0x49) ships bound to a left-click mouse-turbo (200 ms), not
    to keyboard '0'. That is why, out of the box, it behaves as a plain
    left click on the host. Rebind it here to change that.

    Confirmed on a second unit (receiver, firmware 1.1, Linux hidraw), see
    https://github.com/geezmolycos/razerqdhid/pull/7#issuecomment-5975549710:
      - set_button_function (0x020c) writes and reads back on both
        hypershift layers.
      - Keyboard usages F13..F24 (0x68..0x73) can be stored and are sent by
        the mouse. Synapse 4 never writes them, so they only worked under
        Synapse before.
      - Consumer (0x0a) and hypershift-toggle (0x0c) functions work on any
        button, including middle click and the wheel tilts.
      - Battery (0x0780) and idle time (0x0783) answer OK.
      - NOT_SUPPORTED: LED effect/brightness (0x0f82, 0x0f84), flash usage
        (0x068e), macro count/list (0x0680, 0x068b) and the three wheel
        settings. Those are declared below so the UI hides them.
    """

    vid = 0x1532
    pid = 0x00B4
    ifn = 0
    model_name = 'Razer Naga V2 HyperSpeed'
    # No free-spin wheel: 0x94/0x96/0x97 (and their setters) answer NOT_SUPPORTED.
    # No RGB lighting (0x0f82/0x0f84), and the flash-usage (0x068e) and macro
    # count/list (0x0680/0x068b) commands answer NOT_SUPPORTED too, so macro
    # storage is not exposed on this model.
    unsupported = ('scroll_mode', 'scroll_acceleration', 'scroll_smart_reel',
                   'led', 'macros', 'flash_usage')
    buttons_layout = [
        'left', 'middle', 'right', 'wheel_up',
        'wheel_left', 'wheel_right', 'dpi_up', 'wheel_down',
        'thumb_1', 'thumb_2', 'thumb_3', 'dpi_down',
        'thumb_4', 'thumb_5', 'thumb_6', None,
        'thumb_7', 'thumb_8', 'thumb_9', None,
        'thumb_10', 'thumb_11', 'thumb_12', None,
    ]

    def _fix_interface_number(self, it):
        fio = tuple(it.get('fio_count') or ())
        if (it.get('vendor_id') == self.vid and it.get('product_id') == self.pid
                and it.get('interface_number', -1) == -1
                and len(fio) >= 1 and fio[0] > 0):
            it['interface_number'] = self.ifn
        return it
