#!/bin/bash
API_URL=$(cat .api_url)
echo "🧪 Testing API at: $API_URL"
echo ""
echo "📊 Root:"
curl -s $API_URL/ | jq .
echo ""
echo "📱 WhatsApp Status:"
curl -s $API_URL/api/whatsapp/status | jq .
echo ""
echo "👥 WhatsApp Groups:"
curl -s $API_URL/api/whatsapp/groups | jq .
