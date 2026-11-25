"""Hand-written training messages for the SMS agent (simulated dataset).

Written by the builder for the hackathon prototype; NOT real customer data
and NOT the organisers' dataset. Replace with the organisers' labelled SMS
data once the sandbox arrives (split by sender/account, tune threshold to
keep honest-message false alarms low, then re-save the model).

Label "scam" = scam-like social-engineering text; "honest" = legitimate
alerts and ordinary personal messages. The five REQUIRED_SCAMS texts from
the project handover are included verbatim.
"""

SCAM_MESSAGES = [
    # fake deposit / fake reversal + request to return money
    "I have sent you GH₵300. Please return GH₵200 immediately.",
    "Your transaction has been reversed. Return the money.",
    "I sent you GHS 500 by mistake. Please send it back now.",
    "I have transferred 300 cedis to your number. Return 200 to me urgently.",
    "Dear customer, your payment of GHS 1,000 was reversed. Send it back to this number.",
    "I paid you GH₵400 for the goods but changed my mind. Return the money now.",
    "Your MoMo transfer of GHS 250 has been cancelled. Please refund the sender.",
    "Hello, I mistakenly sent you 600 cedis. Kindly return it before end of day.",
    # impersonation + credential theft
    "Your MoMo account will be blocked unless you verify your PIN.",
    "I am an MTN agent. Send me your OTP.",
    "This is MTN head office. Your SIM will be deactivated. Call us and confirm your PIN.",
    "Dear customer, your bank account is suspended. Reply with your OTP to reactivate.",
    "MTN MoMo: your wallet is limited. Verify your identity by sending your code.",
    "We are from the Bank of Ghana. Your account needs verification. Share your PIN.",
    "Your SIM card will be blocked today. Press 1 and enter your MoMo PIN to keep it.",
    "Government grant office: to receive your GH₵2,000 grant, send your OTP code.",
    # advance fee / prize / job
    "You have won a prize. Pay a processing fee.",
    "Congratulations! You won GHS 10,000 in the MTN promo. Send GH₵100 release fee.",
    "You are selected for a job. Pay GH₵150 registration fee to start work.",
    "Your loan of GHS 5,000 is approved. Pay a small processing fee to receive it.",
    "MTN anniversary: you won a Toyota car. Pay delivery fee of GH₵500 now.",
    "You have a pending grant of 3,000 cedis. Pay the clearance fee to claim.",
    # urgency / pressure variants
    "Act now! Your MoMo will be frozen in 1 hour. Send your PIN to stop it.",
    "Final warning: return the GH₵200 you received or we report you to police today.",
]

HONEST_MESSAGES = [
    # legitimate MoMo / bank alerts
    "You have received GHS 300.00 from KOFI MENSAH. Your new balance is GHS 1,800.00.",
    "You have sent GHS 100.00 to AMA SERWAA. Your new balance is GHS 1,400.00.",
    "MoMo: Your balance is GHS 1,500.00. Thank you for using MTN Mobile Money.",
    "You have received GHS 50.00 from 0244123456. Reference: TX88231.",
    "GCB Bank: Your account has been credited with GHS 2,500.00. Salary for November.",
    "Your airtime purchase of GHS 10.00 was successful. Thank you.",
    "MoMo statement: 5 transactions this week. Total sent GHS 320.00.",
    "Your withdrawal of GHS 200.00 at agent KUMASI CENTRAL was successful.",
    "Ecobank alert: debit of GHS 45.00 for electricity purchase. Balance GHS 900.00.",
    "MTN: Your data bundle of 2GB expires tomorrow. Dial *138# to renew.",
    "You have received GHS 60.00 from AUNTY AKOS. Your new balance is GHS 1,560.00.",
    "MoMo: Transaction successful. GHS 80.00 sent to 0209876543.",
    # ordinary personal messages
    "Aunty, are you coming to the market today?",
    "I will be home around 6pm. Please start the soup.",
    "The meeting is moved to Thursday. Same time.",
    "Happy birthday! God bless you.",
    "Please buy tomatoes and onions on your way home.",
    "Church service starts at 9am on Sunday. Don't forget.",
    "How much is a bag of rice at your shop now?",
    "I arrived safely in Accra. Thanks for everything.",
    "Can you pick the children from school at 3?",
    "The trotro fare has increased to 5 cedis these days.",
    "Your order of fabric is ready. Come to the shop anytime.",
    "Reminder: community clean-up exercise this Saturday morning.",
]

DATASET = [(t, "scam") for t in SCAM_MESSAGES] + [(t, "honest") for t in HONEST_MESSAGES]